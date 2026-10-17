import { Inject, Injectable } from '@nestjs/common';
import type { TickEvent } from '@status/shared';
import { and, desc, eq } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import { AiService } from '../ai/ai.service';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import {
  characterMemories,
  type characters,
  comments,
  conversations,
  messages,
  posts,
  relationships,
  type accounts,
  type storyBeats,
} from '../db/schema';

type Account = typeof accounts.$inferSelect;
type Character = typeof characters.$inferSelect & { account: Account };

export interface FeedPost {
  id: string;
  author: Account;
  caption: string;
  createdAt: Date;
  comments: { author: Account; text: string }[];
}

/** Everything a tick loads once and shares between agent turns. */
export interface TickContext {
  worldId: string;
  tick: number;
  player: Account;
  accountsById: Map<string, Account>;
  /** Newest first. Turns append to it, so later agents see earlier agents' actions. */
  feed: FeedPost[];
  activeBeat: typeof storyBeats.$inferSelect | null;
  flags: Record<string, unknown>;
}

const FEED_IN_STATE = 8;
const COMMENTS_PER_POST = 3;
const MEMORIES_IN_STATE = 8;
const DM_HISTORY = 8;

const photo = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

@Injectable()
export class AgentService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ai: AiService,
  ) {}

  /** Gives one character a turn. Returns what they did, or null if they did nothing. */
  async takeTurn(ctx: TickContext, character: Character): Promise<TickEvent | null> {
    const [memories, rels, dm] = await Promise.all([
      this.db.query.characterMemories.findMany({
        where: eq(characterMemories.characterId, character.id),
        orderBy: desc(characterMemories.createdAt),
        limit: MEMORIES_IN_STATE,
      }),
      this.db.query.relationships.findMany({
        where: eq(relationships.characterId, character.id),
      }),
      this.db.query.conversations.findFirst({
        where: and(eq(conversations.worldId, ctx.worldId), eq(conversations.agentId, character.accountId)),
        with: { messages: { orderBy: desc(messages.createdAt), limit: DM_HISTORY } },
      }),
    ]);

    const me = character.account;
    const dmHistory = (dm?.messages ?? []).toReversed().map((m) => ({
      from: m.senderId === me.id ? me.username : ctx.player.username,
      text: m.text,
    }));
    const awaitingReply = dmHistory.at(-1)?.from === ctx.player.username;
    const feed = ctx.feed.slice(0, FEED_IN_STATE);

    const state = {
      you: { username: me.username, name: me.name, persona: character.persona, secrets: character.secrets },
      player: { username: ctx.player.username, note: 'The one real human in this world.' },
      memories: memories.map((m) => m.content),
      relationships: rels.map((r) => ({
        username: ctx.accountsById.get(r.targetAccountId)?.username,
        score: r.score,
        scale: '-100 hostile .. 100 devoted',
      })),
      story: {
        activeBeat: ctx.activeBeat && {
          title: ctx.activeBeat.title,
          description: ctx.activeBeat.description,
        },
        flags: ctx.flags,
      },
      feed: feed.map((p, i) => ({
        ref: `p${i}`,
        author: p.author.username,
        caption: p.caption,
        minutesAgo: Math.round((Date.now() - p.createdAt.getTime()) / 60_000),
        latestComments: p.comments.slice(-COMMENTS_PER_POST).map((c) => `${c.author.username}: ${c.text}`),
      })),
      dmWithPlayer: { messages: dmHistory, awaitingYourReply: awaitingReply },
    };

    const { choice } = await this.ai.decide(state, {
      type: 'choice',
      instructions:
        `You are ${me.username}. What do you do right now? Real people mostly scroll without posting, ` +
        'so pick "nothing" unless something in your life, the story or the feed gives you a reason. ' +
        (awaitingReply ? `${ctx.player.username} sent you a message you haven't answered yet.` : ''),
      options: {
        post: 'Publish a new post about your life',
        comment: 'Comment on one of the posts in the feed',
        message_player: awaitingReply
          ? `Reply to ${ctx.player.username}'s private message`
          : `Send ${ctx.player.username} a private message`,
        nothing: 'Do nothing this time',
      },
    });

    const system = this.systemPrompt(ctx, character, memories.map((m) => m.content));
    switch (choice) {
      case 'post':
        return this.post(ctx, character, system);
      case 'comment':
        return feed.length ? this.comment(character, system, state, feed) : null;
      case 'message_player':
        return this.messagePlayer(ctx, character, system, dmHistory, dm?.id);
      case 'nothing':
        return null;
    }
  }

  private systemPrompt(ctx: TickContext, character: Character, memories: string[]) {
    const lines = [
      character.persona,
      '',
      `You are @${character.account.username} on StatUs, an Instagram-like social network. Stay in character.`,
      'Keep it short and natural, like a real post or message on social media.',
      "Always write something new in your own voice. Never repeat or copy someone else's words.",
    ];
    if (character.secrets.length) {
      lines.push(
        '',
        'Your secrets (never state them outright; at most hint at them if the story calls for it):',
        ...character.secrets.map((s) => `- ${s}`),
      );
    }
    if (memories.length) lines.push('', 'Things you remember:', ...memories.map((m) => `- ${m}`));
    if (ctx.activeBeat) {
      lines.push(
        '',
        `Current storyline: ${ctx.activeBeat.title}. ${ctx.activeBeat.description}`,
        'Act it out only if it involves you.',
      );
    }
    return lines.join('\n');
  }

  private async post(ctx: TickContext, character: Character, system: string): Promise<TickEvent> {
    const caption = clean(
      await this.ai.generate(
        'Write the caption for a new post you are publishing now. Only the caption: 1-3 short sentences, ' +
          'emoji and hashtags optional. No quotation marks.',
        { system, maxTokens: 300 },
      ),
    );
    const [row] = await this.db
      .insert(posts)
      .values({
        worldId: ctx.worldId,
        authorId: character.accountId,
        // Placeholder until agents can generate images.
        imageUrl: photo(`${character.account.username}-${ctx.tick}-${Date.now()}`),
        caption,
        likeCount: 5 + Math.floor(Math.random() * 80),
      })
      .returning();

    ctx.feed.unshift({ id: row.id, author: character.account, caption, createdAt: row.createdAt, comments: [] });
    await this.remember(character, `פרסמתי פוסט: ${caption}`);
    return { type: 'post', actor: toUser(character.account), postId: row.id, text: caption };
  }

  private async comment(
    character: Character,
    system: string,
    state: object,
    feed: FeedPost[],
  ): Promise<TickEvent | null> {
    const options = Object.fromEntries(
      feed.map((p, i) => [`p${i}`, `@${p.author.username}: ${p.caption} (${p.comments.length} comments)`]),
    );
    const { choice } = await this.ai.decide(state, {
      type: 'choice',
      instructions: `You are ${character.account.username}. Which post do you comment on?`,
      options,
    });
    const target = feed[Number(choice.slice(1))];
    if (!target) return null;

    const thread = target.comments
      .slice(-COMMENTS_PER_POST)
      .map((c) => `@${c.author.username}: ${c.text}`)
      .join('\n');
    const text = clean(
      await this.ai.generate(
        `Post by @${target.author.username}: "${target.caption}"\n` +
          (thread ? `Latest comments:\n${thread}\n` : '') +
          '\nWrite your comment on this post. Only the comment, one short sentence. No quotation marks.',
        { system, maxTokens: 200 },
      ),
    );
    // Small models sometimes parrot an existing comment; drop those rather than post a copy.
    if (!text || target.comments.some((c) => c.text === text) || text === target.caption) return null;
    await this.db.insert(comments).values({ postId: target.id, authorId: character.accountId, text });

    target.comments.push({ author: character.account, text });
    await this.remember(character, `הגבתי לפוסט של ${target.author.username}: ${text}`);
    return {
      type: 'comment',
      actor: toUser(character.account),
      postId: target.id,
      postAuthor: toUser(target.author),
      text,
    };
  }

  private async messagePlayer(
    ctx: TickContext,
    character: Character,
    system: string,
    history: { from: string; text: string }[],
    conversationId: string | undefined,
  ): Promise<TickEvent> {
    const transcript = history.map((m) => `@${m.from}: ${m.text}`).join('\n');
    const text = clean(
      await this.ai.generate(
        (transcript
          ? `Your private chat with @${ctx.player.username} so far:\n${transcript}\n\n`
          : `You are starting a private chat with @${ctx.player.username}.\n\n`) +
          'Write your next message. Only the message, 1-2 short sentences. No quotation marks.',
        { system, maxTokens: 200 },
      ),
    );

    let id = conversationId;
    if (!id) {
      const [row] = await this.db
        .insert(conversations)
        .values({ worldId: ctx.worldId, agentId: character.accountId })
        .returning();
      id = row.id;
    }
    await this.db.insert(messages).values({ conversationId: id, senderId: character.accountId, text });

    await this.remember(character, `כתבתי ל-${ctx.player.username}: ${text}`);
    return { type: 'message', actor: toUser(character.account), conversationId: id, text };
  }

  private async remember(character: Character, content: string) {
    await this.db.insert(characterMemories).values({ characterId: character.id, content, importance: 3 });
  }
}

/** Strips model artifacts: leftover <think> blocks and wrapping quotes. */
function clean(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .replace(/^["'״“”]+|["'״“”]+$/g, '')
    .trim();
}
