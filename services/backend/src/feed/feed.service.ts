import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Comment, LikeResult, Post, Profile, StoryGroup, User } from '@status/shared';
import { and, asc, desc, eq, gt, ne } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import { AiService } from '../ai/ai.service';
import type { ImageInput } from '../ai/providers/provider';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { accounts, comments, posts, stories } from '../db/schema';
import { StatsService } from '../stats/stats.service';
import { StorageService } from '../storage/storage.service';
import { WorldChanges } from '../world/world-changes';

type Account = typeof accounts.$inferSelect;

/** The parts of an uploaded file (from multer) that createPost uses. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

const FEED_LIMIT = 50;

const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS: Record<ImageInput['mediaType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const likes = (post: typeof posts.$inferSelect): LikeResult => ({
  likes: post.likeCount + Number(post.playerLiked),
  liked: post.playerLiked,
});

type PostRow = typeof posts.$inferSelect & {
  author: Account;
  comments: (typeof comments.$inferSelect & { author: Account })[];
};

const toPost = (post: PostRow): Post => ({
  id: post.id,
  author: toUser(post.author),
  imageUrl: post.imageUrl,
  caption: post.caption,
  ...likes(post),
  createdAt: post.createdAt.toISOString(),
  comments: post.comments.map((comment) => ({
    id: comment.id,
    author: toUser(comment.author),
    text: comment.text,
    createdAt: comment.createdAt.toISOString(),
  })),
});

export const STORY_TTL_MS = 24 * 60 * 60_000;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly changes: WorldChanges,
    private readonly stats: StatsService,
  ) {}

  /**
   * The user posts a photo. It's stored in Supabase Storage, and a vision model
   * describes it in the background (posts.image_description) so agents can react
   * to what's actually in it on the next tick.
   */
  async createPost(me: Account, image: UploadedImage | undefined, caption: string): Promise<Post> {
    if (!image) return this.createTextPost(me, caption);
    if (!IMAGE_TYPES.has(image.mimetype)) {
      throw new BadRequestException('Expected a JPEG, PNG or WebP image');
    }
    const mediaType = image.mimetype as ImageInput['mediaType'];
    const path = `${me.worldId}/posts/${randomUUID()}.${EXTENSIONS[mediaType]}`;
    const imageUrl = await this.storage.upload(path, image.buffer, mediaType);

    const [row] = await this.db
      .insert(posts)
      .values({ worldId: me.worldId, authorId: me.id, imageUrl, caption })
      .returning();
    await this.stats.record(me.worldId, { kind: 'photo_post', text: caption });
    // Tracked: the agents' next tick gets prepared once they can "see" the photo.
    void this.changes
      .track(me.worldId, () => this.describe(row.id, { data: image.buffer.toString('base64'), mediaType }))
      .catch((error: unknown) => this.logger.warn(`Could not describe the photo of post ${row.id}: ${String(error)}`));
    return toPost({ ...row, author: me, comments: [] });
  }

  /** No photo: the caption is the post. */
  private async createTextPost(me: Account, caption: string): Promise<Post> {
    if (!caption) throw new BadRequestException('A post without a photo needs text');
    const [row] = await this.db
      .insert(posts)
      .values({ worldId: me.worldId, authorId: me.id, imageUrl: null, caption })
      .returning();
    await this.stats.record(me.worldId, { kind: 'text_post', text: caption });
    this.changes.changed(me.worldId);
    return toPost({ ...row, author: me, comments: [] });
  }

  private async describe(postId: string, image: ImageInput) {
    const description = await this.ai.generate(
      'לתאר מה רואים בתמונה ב-1 עד 2 משפטים קצרים: מי או מה בתמונה, איפה, ומה האווירה. ' +
        'רק התיאור, בלי הקדמה ובלי פרשנות.',
      {
        system: 'המשימה: לתאר תמונה בשביל אנשים שלא רואים אותה. תיאור עובדתי ופשוט.',
        temperature: 0.3,
        images: [image],
      },
    );
    await this.db.update(posts).set({ imageDescription: description }).where(eq(posts.id, postId));
  }

  /** The user comments on a post in their world. Agents notice it on the next tick. */
  async addComment(me: Account, postId: string, text: string): Promise<Comment> {
    const post = await this.db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.worldId, me.worldId)),
    });
    if (!post) throw new NotFoundException();

    const [row] = await this.db.insert(comments).values({ postId, authorId: me.id, text }).returning();
    await this.stats.record(me.worldId, { kind: 'comment', text });
    this.changes.changed(me.worldId);
    return { id: row.id, author: toUser(me), text: row.text, createdAt: row.createdAt.toISOString() };
  }

  /** The user likes or unlikes a post. */
  async setLiked(me: Account, postId: string, liked: boolean): Promise<LikeResult> {
    const before = await this.db.query.posts.findFirst({
      columns: { playerLiked: true },
      where: and(eq(posts.id, postId), eq(posts.worldId, me.worldId)),
    });
    if (!before) throw new NotFoundException();
    const [post] = await this.db
      .update(posts)
      .set({ playerLiked: liked })
      .where(and(eq(posts.id, postId), eq(posts.worldId, me.worldId)))
      .returning();
    if (!post) throw new NotFoundException();
    // Only a real change counts, not a repeated tap.
    if (before.playerLiked !== liked) await this.stats.record(me.worldId, { kind: liked ? 'like' : 'unlike' });
    return likes(post);
  }

  /** The world's feed, newest first; with `authorId`, only that account's posts. */
  async getPosts(worldId: string, authorId?: string): Promise<Post[]> {
    const rows = await this.db.query.posts.findMany({
      where: and(eq(posts.worldId, worldId), authorId ? eq(posts.authorId, authorId) : undefined),
      orderBy: desc(posts.createdAt),
      limit: FEED_LIMIT,
      with: {
        author: true,
        comments: { orderBy: asc(comments.createdAt), with: { author: true } },
      },
    });

    return rows.map(toPost);
  }

  /** Everyone in the world but the user: the agents, oldest account first. */
  async getPeople(me: Account): Promise<User[]> {
    const rows = await this.db.query.accounts.findMany({
      where: and(eq(accounts.worldId, me.worldId), ne(accounts.id, me.id)),
      orderBy: asc(accounts.createdAt),
    });
    return rows.map(toUser);
  }

  /** Someone's profile page in the user's world, by username. */
  async getProfile(worldId: string, username: string): Promise<Profile> {
    const account = await this.db.query.accounts.findFirst({
      where: and(eq(accounts.worldId, worldId), eq(accounts.username, username)),
    });
    if (!account) throw new NotFoundException();
    return { user: toUser(account), bio: account.bio, posts: await this.getPosts(worldId, account.id) };
  }

  // Grouped by author, most recently active author first. Like Instagram, stories
  // disappear after a day.
  async getStoryGroups(worldId: string): Promise<StoryGroup[]> {
    const rows = await this.db.query.stories.findMany({
      where: and(eq(stories.worldId, worldId), gt(stories.createdAt, new Date(Date.now() - STORY_TTL_MS))),
      orderBy: desc(stories.createdAt),
      with: { author: true },
    });

    const groups = new Map<string, StoryGroup>();
    for (const story of rows) {
      let group = groups.get(story.authorId);
      if (!group) {
        group = { user: toUser(story.author), stories: [] };
        groups.set(story.authorId, group);
      }
      // Rows are newest first; the viewer plays each author's stories oldest first.
      group.stories.unshift({
        id: story.id,
        imageUrl: story.imageUrl,
        text: story.text,
        createdAt: story.createdAt.toISOString(),
      });
    }
    return [...groups.values()];
  }
}
