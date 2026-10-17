// API response shapes shared by @status/backend and @status/frontend.
// Types only: this package has no runtime code, so import it with `import type`.
// Timestamps are ISO 8601 strings; the frontend formats them for display.

export interface User {
  id: string
  username: string
  name: string
  avatarUrl: string
}

export interface Comment {
  id: string
  author: User
  text: string
  createdAt: string
}

export interface Post {
  id: string
  author: User
  imageUrl: string
  caption: string
  likes: number
  createdAt: string
  comments: Comment[]
}

export interface Story {
  id: string
  imageUrl: string
  createdAt: string
}

export interface StoryGroup {
  user: User
  stories: Story[]
}

export interface Message {
  id: string
  fromMe: boolean
  text: string
  createdAt: string
}

export interface ConversationSummary {
  id: string
  user: User
  lastMessage: Message | null
}

export interface Conversation {
  id: string
  user: User
  messages: Message[]
}

// --- World ticks and energy ------------------------------------------------

export interface Energy {
  current: number
  max: number
  /** When the next point regenerates; null when full. */
  nextAt: string | null
}

export interface WorldStatus {
  /** Ticks run so far. */
  tick: number
  energy: Energy
}

/** Something an agent did during a tick. `text` is the Hebrew content they wrote. */
export type TickEvent =
  | { type: 'post'; actor: User; postId: string; text: string }
  | { type: 'comment'; actor: User; postId: string; postAuthor: User; text: string }
  | { type: 'message'; actor: User; conversationId: string; text: string }

export interface TickResult {
  world: WorldStatus
  events: TickEvent[]
}

/** Error codes for POST /api/world/tick (HTTP 409). */
export type TickErrorCode = 'NO_ENERGY' | 'TICK_IN_PROGRESS'

// --- Request bodies ----------------------------------------------------------

/** POST /api/posts/:id/comments → Comment */
export interface CreateCommentBody {
  text: string
}

/** POST /api/conversations/:id/messages → Message */
export interface SendMessageBody {
  text: string
}
