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
