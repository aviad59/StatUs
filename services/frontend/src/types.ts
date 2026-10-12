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
}

export interface Post {
  id: string
  author: User
  imageUrl: string
  caption: string
  likes: number
  postedAgo: string
  comments: Comment[]
}

export interface Story {
  id: string
  imageUrl: string
}

export interface StoryGroup {
  user: User
  stories: Story[]
}

export interface Message {
  id: string
  fromMe: boolean
  text: string
  sentAt: string
}

export interface Conversation {
  id: string
  user: User
  lastActive: string
  messages: Message[]
}
