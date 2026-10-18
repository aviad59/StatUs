import { createBrowserRouter } from 'react-router'
import { commentAction, sendMessageAction, tickAction } from './actions.ts'
import { RootLayout } from './layouts/RootLayout.tsx'
import { conversationLoader, feedLoader, messagesLoader, rootLoader } from './loaders.ts'
import { ConversationPage } from './pages/ConversationPage.tsx'
import { ErrorPage } from './pages/ErrorPage.tsx'
import { FeedPage } from './pages/FeedPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

export const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    loader: rootLoader,
    // The current user doesn't change when you comment, DM or tick; skip reloading it.
    shouldRevalidate: ({ formMethod, defaultShouldRevalidate }) =>
      formMethod ? false : defaultShouldRevalidate,
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement: null,
    children: [
      { index: true, loader: feedLoader, element: <FeedPage /> },
      { path: 'messages', loader: messagesLoader, element: <MessagesPage /> },
      {
        path: 'messages/:id',
        loader: conversationLoader,
        action: sendMessageAction,
        element: <ConversationPage />,
      },
      { path: 'profile', element: <ProfilePage /> },
      // Action-only routes (no UI), submitted to with useFetcher().
      { path: 'actions/tick', action: tickAction },
      { path: 'actions/posts/:id/comments', action: commentAction },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
