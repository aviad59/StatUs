import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
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
  createdAt: createdAt(),
}).enableRLS();

export const accountKind = pgEnum('account_kind', ['human', 'agent']);

// The world's human user and its AI agents.
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    kind: accountKind('kind').notNull(),
    username: text('username').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url').notNull(),
    // Agent persona prompt; null for the human.
    persona: text('persona'),
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

export const accountsRelations = relations(accounts, ({ one }) => ({
  world: one(worlds, { fields: [accounts.worldId], references: [worlds.id] }),
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
