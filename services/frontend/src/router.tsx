import { createBrowserRouter } from 'react-router'
import { RootLayout } from './layouts/RootLayout.tsx'
import { ConversationPage } from './pages/ConversationPage.tsx'
import { FeedPage } from './pages/FeedPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <FeedPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'messages/:id', element: <ConversationPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
