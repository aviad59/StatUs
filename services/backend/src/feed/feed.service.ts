import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Comment, LikeResult, Post, StoryGroup } from '@status/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { type accounts, comments, posts, stories } from '../db/schema';

const FEED_LIMIT = 50;

const likes = (post: typeof posts.$inferSelect): LikeResult => ({
  likes: post.likeCount + Number(post.playerLiked),
  liked: post.playerLiked,
});

@Injectable()
export class FeedService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The user comments on a post in their world. Agents notice it on the next tick. */
  async addComment(me: typeof accounts.$inferSelect, postId: string, text: string): Promise<Comment> {
    const post = await this.db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.worldId, me.worldId)),
    });
    if (!post) throw new NotFoundException();

    const [row] = await this.db.insert(comments).values({ postId, authorId: me.id, text }).returning();
    return { id: row.id, author: toUser(me), text: row.text, createdAt: row.createdAt.toISOString() };
  }

  /** The user likes or unlikes a post. */
  async setLiked(me: typeof accounts.$inferSelect, postId: string, liked: boolean): Promise<LikeResult> {
    const [post] = await this.db
      .update(posts)
      .set({ playerLiked: liked })
      .where(and(eq(posts.id, postId), eq(posts.worldId, me.worldId)))
      .returning();
    if (!post) throw new NotFoundException();
    return likes(post);
  }

  async getPosts(worldId: string): Promise<Post[]> {
    const rows = await this.db.query.posts.findMany({
      where: eq(posts.worldId, worldId),
      orderBy: desc(posts.createdAt),
      limit: FEED_LIMIT,
      with: {
        author: true,
        comments: { orderBy: asc(comments.createdAt), with: { author: true } },
      },
    });

    return rows.map((post) => ({
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
    }));
  }

  // Grouped by author, most recently active author first. Stories never expire yet.
  async getStoryGroups(worldId: string): Promise<StoryGroup[]> {
    const rows = await this.db.query.stories.findMany({
      where: eq(stories.worldId, worldId),
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
        createdAt: story.createdAt.toISOString(),
      });
    }
    return [...groups.values()];
  }
}
