import { createBrowserRouter } from 'react-router'
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
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement: null,
    children: [
      { index: true, loader: feedLoader, element: <FeedPage /> },
      { path: 'messages', loader: messagesLoader, element: <MessagesPage /> },
      { path: 'messages/:id', loader: conversationLoader, element: <ConversationPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
