import { type ActionFunctionArgs, createBrowserRouter } from 'react-router'
import {
  chooseGenderAction,
  chooseSceneAction,
  commentAction,
  createPostAction,
  likeAction,
  readAction,
  replyAction,
  sendMessageAction,
  startConversationAction,
  storyReplyAction,
  tickAction,
} from './actions.ts'
import { RootLayout } from './layouts/RootLayout.tsx'
import {
  clearCache,
  conversationLoader,
  feedLoader,
  messagesLoader,
  profileLoader,
  rootLoader,
  userLoader,
} from './loaders.ts'
import { ConversationPage } from './pages/ConversationPage.tsx'
import { ErrorPage } from './pages/ErrorPage.tsx'
import { FeedPage } from './pages/FeedPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { NewPostPage } from './pages/NewPostPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { UserPage } from './pages/UserPage.tsx'
import { WelcomePage } from './pages/WelcomePage.tsx'

// Every action can change what the pages show, so the loaders' cache is dropped
// before React Router reloads them.
const fresh =
  <T,>(action: (args: ActionFunctionArgs) => Promise<T>) =>
  async (args: ActionFunctionArgs) => {
    try {
      return await action(args)
    } finally {
      clearCache()
    }
  }

export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    loader: rootLoader,
    // Reload after every write: the user's actions change their stats, choosing a gender changes the
    // user (welcome screen), and ticks, sending, replies and opening a chat change the unread count.
    shouldRevalidate: ({ formMethod, defaultShouldRevalidate }) => Boolean(formMethod) || defaultShouldRevalidate,
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement: null,
    children: [
      { index: true, loader: feedLoader, element: <FeedPage /> },
      { path: 'messages', loader: messagesLoader, element: <MessagesPage /> },
      {
        path: 'messages/:id',
        loader: conversationLoader,
        action: fresh(sendMessageAction),
        element: <ConversationPage />,
      },
      { path: 'new', action: fresh(createPostAction), element: <NewPostPage /> },
      { path: 'profile', loader: profileLoader, element: <ProfilePage /> },
      // An agent's profile; its action opens a DM with them.
      { path: 'u/:username', loader: userLoader, action: fresh(startConversationAction), element: <UserPage /> },
      { path: 'welcome', action: fresh(chooseGenderAction), element: <WelcomePage /> },
      // Action-only routes (no UI), submitted to with useFetcher().
      { path: 'actions/tick', action: fresh(tickAction) },
      { path: 'actions/posts/:id/comments', action: fresh(commentAction) },
      { path: 'actions/posts/:id/like', action: fresh(likeAction) },
      { path: 'actions/conversations/:id/reply', action: fresh(replyAction) },
      { path: 'actions/conversations/:id/read', action: fresh(readAction) },
      { path: 'actions/stories/:id/reply', action: fresh(storyReplyAction) },
      { path: 'actions/scenes/:id/choose', action: fresh(chooseSceneAction) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
