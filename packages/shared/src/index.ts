// API response shapes shared by @status/backend and @status/frontend.
// Types only: this package has no runtime code, so import it with `import type`.
// Timestamps are ISO 8601 strings; the frontend formats them for display.

/** Hebrew conjugates by gender, so agents need it to talk about and to someone. */
export type Gender = 'female' | 'male'

export interface User {
  id: string
  username: string
  name: string
  avatarUrl: string
  /** Null when unknown; agents then address the account neutrally. */
  gender: Gender | null
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
  /** Null for a text-only post. */
  imageUrl: string | null
  caption: string
  /** Includes the user's own like. */
  likes: number
  /** Whether the user liked it. */
  liked: boolean
  createdAt: string
  comments: Comment[]
}

export interface Story {
  id: string
  imageUrl: string
  /** Short text shown over the photo. */
  text: string | null
  createdAt: string
}

export interface StoryGroup {
  user: User
  stories: Story[]
}

/**
 * "Meanwhile, in real life": something that happened off the network, narrated to the
 * user (who was there). Shown in the feed among the posts. GET /api/scenes, newest first.
 */
export interface Scene {
  id: string
  /** Where and when, e.g. "📍 הסלון של מאיה, תל אביב · חמישי, 23:40". */
  place: string
  text: string
  imageUrl: string | null
  /** What the user can decide here; empty when there's nothing to choose. */
  choices: { key: string; label: string }[]
  /** The key the user picked, or null. */
  chosen: string | null
  createdAt: string
}

/** A chapter of the story, as the user knows it (never the secrets behind it). */
export interface Chapter {
  id: string
  /** 1-based, in the order the chapters happened. */
  number: number
  title: string
  /** What's going on, in plain words. */
  brief: string | null
  /** What the user can do now (current chapter only). */
  hint: string | null
  /** Whom to talk to about it, if anyone: opens a chat with them. */
  hintUser: User | null
  /** What happened in real life in this chapter, if anything. */
  scene: Scene | null
  current: boolean
}

/** GET /api/story: the "story right now" card and the story so far. */
export interface StoryNow {
  season: { title: string; logline: string }
  /** The act the story is in; null once the season is over. */
  act: { number: number; total: number; title: string } | null
  /** The chapter going on now; null between chapters (the next is being written). */
  current: Chapter | null
  /** Earlier chapters, newest first. */
  past: Chapter[]
  /** The next chapter is being written right now. */
  writing: boolean
}

/** GET /api/accounts/:username: someone's profile page. */
export interface Profile {
  user: User
  /** Public profile text (empty when there is none). */
  bio: string
  /** Their posts, newest first. */
  posts: Post[]
}

export interface Message {
  id: string
  fromMe: boolean
  text: string
  /** The story this message replies to (shown as a thumbnail above it). */
  story: { imageUrl: string; text: string | null } | null
  createdAt: string
}

export interface ConversationSummary {
  id: string
  user: User
  lastMessage: Message | null
  /** The agent wrote last, after the user last opened the conversation. */
  unread: boolean
}

export interface Conversation {
  id: string
  user: User
  messages: Message[]
  unread: boolean
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
  /** DMs: messages left before the next one costs an energy point, and how many one point buys. */
  dm: { messagesLeft: number; perEnergy: number }
  /** The story's next chapter is being written right now (it may come with a new scene). */
  storyWriting: boolean
}

/** Something an agent did during a tick. `text` is the Hebrew content they wrote. */
export type TickEvent =
  | { type: 'post'; actor: User; postId: string; text: string }
  | { type: 'story'; actor: User; storyId: string; text: string }
  | { type: 'comment'; actor: User; postId: string; postAuthor: User; text: string }
  | { type: 'message'; actor: User; conversationId: string; text: string }

export interface TickResult {
  world: WorldStatus
  events: TickEvent[]
  /** The story moves to its next chapter after this tick: a new scene usually follows within a minute. */
  storyMoving: boolean
}

/** Error codes for POST /api/world/tick (HTTP 409). */
export type TickErrorCode = 'NO_ENERGY' | 'TICK_IN_PROGRESS'

// --- Player stats --------------------------------------------------------------

/** The user's three stats, 0..100 each. Every action the user takes nudges them (scored without AI). */
export interface PlayerStats {
  /** Cool, confidence, presence. Lost by double-texting, rambling or over-liking. */
  aura: number
  /** How funny the user comes across. */
  humor: number
  /** How much the user stirs the pot. */
  drama: number
  /** What the last action changed, and why (Hebrew); null before the first action. */
  last: { aura: number; humor: number; drama: number; reason: string; at: string } | null
}

// --- Request bodies ----------------------------------------------------------

/** PATCH /api/me → User. Only while the gender is still unset (409 GENDER_ALREADY_SET). */
export interface UpdateMeBody {
  gender: Gender
}

/**
 * POST /api/posts → Post. Sent as multipart/form-data with the photo as `image`
 * (JPEG, PNG or WebP, at most 10 MB) next to these fields. Without a photo it's a
 * text-only post, and the caption is required.
 */
export interface CreatePostBody {
  caption: string
}

/** POST /api/scenes/:id/choose { choice } → Scene. Once per scene (409 ALREADY_CHOSEN); the story then moves on. */
export interface ChooseSceneBody {
  choice: string
}

/** PUT /api/posts/:id/like { liked } → LikeResult */
export interface LikeBody {
  liked: boolean
}

export interface LikeResult {
  likes: number
  liked: boolean
}

/** POST /api/posts/:id/comments → Comment */
export interface CreateCommentBody {
  text: string
}

/**
 * POST /api/conversations/:id/messages → Message. One energy point buys a few
 * messages; 409 NO_ENERGY when there are none left and no energy.
 */
export interface SendMessageBody {
  text: string
}

/** POST /api/conversations { username } → StartConversationResult: opens a DM with an agent, created if needed. Free; sending costs. */
export interface StartConversationBody {
  username: string
}

export interface StartConversationResult {
  conversationId: string
}

/** POST /api/conversations/:id/reply: the agent answers the last message now. Null if there was nothing to answer. */
export interface ReplyResult {
  message: Message | null
}

/** POST /api/stories/:id/reply { text }: a DM to the story's author, about that story. */
export interface StoryReplyResult {
  conversationId: string
  message: Message
}
