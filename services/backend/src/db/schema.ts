import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// Every human user gets a private world. All other rows belong to exactly one
// world, and every query must be scoped to the current user's world.
//
// RLS is enabled with no policies on every table: Supabase exposes the public
// schema through its REST API, and this keeps it closed. The backend connects
// as the postgres role, which bypasses RLS.

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const worlds = pgTable('worlds', {
  id: id(),
  // How many ticks (world steps) have run.
  tick: integer('tick').notNull().default(0),
  // The user's energy as of energyUpdatedAt; it regenerates over time (see world/energy.ts).
  energy: integer('energy').notNull().default(5),
  energyUpdatedAt: timestamp('energy_updated_at', { withTimezone: true }).notNull().defaultNow(),
  // DMs the user can still send before the next one costs an energy point
  // (one point buys DM_MESSAGES_PER_ENERGY messages).
  dmCredits: integer('dm_credits').notNull().default(0),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
  // Set while a tick runs, so a world never runs two ticks at once.
  tickingSince: timestamp('ticking_since', { withTimezone: true }),
  // The story so far, kept up to date by the story director (world/story.service.ts).
  // Omniscient (it includes everyone's secrets), so it never goes into agent prompts.
  storySummary: text('story_summary').notNull().default(''),
  createdAt: createdAt(),
}).enableRLS();

export const accountKind = pgEnum('account_kind', ['human', 'agent']);

// Hebrew conjugates by gender, so prompts need it: how a character talks about
// themselves, and how others address them. Null = unknown (address neutrally).
export const gender = pgEnum('gender', ['female', 'male']);

// The world's human user and its AI agents.
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    kind: accountKind('kind').notNull(),
    gender: gender('gender'),
    username: text('username').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.worldId, t.username)],
).enableRLS();

export const posts = pgTable(
  'posts',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    caption: text('caption').notNull(),
    // Displayed like count. A world has only a handful of accounts, so this is
    // set by the world's story logic rather than counted from real likes.
    likeCount: integer('like_count').notNull().default(0),
    // Whether the world's one human liked it (on top of likeCount).
    playerLiked: boolean('player_liked').notNull().default(false),
    // What the photo shows, so agents can react to it: a vision model's description of
    // the user's uploads, or the prompt a generated agent photo was drawn from.
    imageDescription: text('image_description'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.worldId, t.createdAt)],
).enableRLS();

export const comments = pgTable(
  'comments',
  {
    id: id(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.postId, t.createdAt)],
).enableRLS();

// Shown for 24 hours (see FeedService.getStories).
export const stories = pgTable(
  'stories',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    // Short text shown over the photo, like Instagram's text stickers.
    text: text('text'),
    // What the photo shows (the prompt it was drawn from), for agents and the story director.
    imageDescription: text('image_description'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.worldId, t.createdAt)],
).enableRLS();

// A DM thread between the world's human and one agent.
export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // When the human last opened the thread; agent messages after it are unread.
    playerReadAt: timestamp('player_read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.worldId, t.agentId)],
).enableRLS();

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.conversationId, t.createdAt)],
).enableRLS();

// ---------------------------------------------------------------------------
// Agents and story state. Content in these tables (personas, secrets, memories,
// beat descriptions) is written in Hebrew, like everything user-facing.

// The mind behind an agent account: who they are and what they hide.
export const characters = pgTable('characters', {
  id: id(),
  worldId: uuid('world_id')
    .notNull()
    .references(() => worlds.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  // Personality, background, voice and posting habits. Goes into the system prompt.
  persona: text('persona').notNull(),
  // Things the character knows but won't say openly (yet). Story beats can reveal them.
  secrets: text('secrets').array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
}).enableRLS();

// Must match the embedding model's output size. 1024 fits multilingual models with
// good Hebrew support (e.g. bge-m3 on Ollama, voyage-3.5). Changing it needs a migration.
export const EMBEDDING_DIMENSIONS = 1024;

// What a character remembers, retrieved by similarity search over `embedding`.
export const characterMemories = pgTable(
  'character_memories',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    // 1 (trivial) .. 10 (life-changing); used to rank and to decide what to forget.
    importance: smallint('importance').notNull().default(5),
    // Null until an embedding provider has processed the memory.
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.characterId, t.createdAt),
    index('character_memories_embedding_index').using('hnsw', t.embedding.op('vector_cosine_ops')),
    check('character_memories_importance_range', sql`${t.importance} between 1 and 10`),
  ],
).enableRLS();

// How a character feels about another account: another character or the player.
// Directed: A's score toward B is independent of B's toward A. The player has no
// row of their own; their feelings are whatever they do.
export const relationships = pgTable(
  'relationships',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    targetAccountId: uuid('target_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // -100 (hostile) .. 0 (neutral) .. 100 (devoted)
    score: integer('score').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.characterId, t.targetAccountId),
    index().on(t.targetAccountId),
    check('relationships_score_range', sql`${t.score} between -100 and 100`),
  ],
).enableRLS();

export const storyBeatStatus = pgEnum('story_beat_status', ['pending', 'active', 'done']);

// Plot points for the world's storyline, played in `position` order.
export const storyBeats = pgTable(
  'story_beats',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    // Stable identifier for code and flags, e.g. 'maya_reveals_breakup'.
    key: text('key').notNull(),
    title: text('title').notNull(),
    // What happens. For the story director only; agents get just their own direction.
    description: text('description').notNull(),
    // What each character does in this beat, by username, e.g. { "noam_levi": "לשלוח ל-@you
    // הודעה ולהתייעץ..." }. The beat is done once each of them has acted (actedBy).
    directions: jsonb('directions').$type<Record<string, string>>().notNull().default({}),
    actedBy: text('acted_by').array().notNull().default(sql`'{}'::text[]`),
    // The tick it became active; beats that drag on are closed (BEAT_MAX_TICKS).
    startedTick: integer('started_tick'),
    position: integer('position').notNull(),
    status: storyBeatStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.worldId, t.key), index().on(t.worldId, t.position)],
).enableRLS();

// Facts about the world's story so far, e.g. player_knows_secret = true.
export const storyFlags = pgTable(
  'story_flags',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    // Any JSON: boolean, number, string or object.
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.key] })],
).enableRLS();

export const accountsRelations = relations(accounts, ({ one }) => ({
  world: one(worlds, { fields: [accounts.worldId], references: [worlds.id] }),
  character: one(characters),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(accounts, { fields: [characters.accountId], references: [accounts.id] }),
  memories: many(characterMemories),
  relationships: many(relationships),
}));

export const characterMemoriesRelations = relations(characterMemories, ({ one }) => ({
  character: one(characters, {
    fields: [characterMemories.characterId],
    references: [characters.id],
  }),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  character: one(characters, { fields: [relationships.characterId], references: [characters.id] }),
  target: one(accounts, { fields: [relationships.targetAccountId], references: [accounts.id] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(accounts, { fields: [posts.authorId], references: [accounts.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(accounts, { fields: [comments.authorId], references: [accounts.id] }),
}));

export const storiesRelations = relations(stories, ({ one }) => ({
  author: one(accounts, { fields: [stories.authorId], references: [accounts.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  agent: one(accounts, { fields: [conversations.agentId], references: [accounts.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
