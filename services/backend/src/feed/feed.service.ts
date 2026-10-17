import { Inject, Injectable } from '@nestjs/common';
import type { Post, StoryGroup } from '@status/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { comments, posts, stories } from '../db/schema';

const FEED_LIMIT = 50;

@Injectable()
export class FeedService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
      likes: post.likeCount,
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
