import { type ActionFunctionArgs, createBrowserRouter } from 'react-router'
import { commentAction, createPostAction, likeAction, replyAction, sendMessageAction, tickAction, updateProfileAction } from './actions.ts'
import { RootLayout } from './layouts/RootLayout.tsx'
import { clearCache, conversationLoader, feedLoader, messagesLoader, profileLoader, rootLoader } from './loaders.ts'
import { ConversationPage } from './pages/ConversationPage.tsx'
import { ErrorPage } from './pages/ErrorPage.tsx'
import { FeedPage } from './pages/FeedPage.tsx'
import { MessagesPage } from './pages/MessagesPage.tsx'
import { NewPostPage } from './pages/NewPostPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

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
    // The current user only changes on the profile page; skip reloading it after
    // comments, DMs and ticks.
    shouldRevalidate: ({ formMethod, formAction, defaultShouldRevalidate }) =>
      formMethod ? formAction === '/profile' : defaultShouldRevalidate,
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
      { path: 'profile', loader: profileLoader, action: fresh(updateProfileAction), element: <ProfilePage /> },
      // Action-only routes (no UI), submitted to with useFetcher().
      { path: 'actions/tick', action: fresh(tickAction) },
      { path: 'actions/posts/:id/comments', action: fresh(commentAction) },
      { path: 'actions/posts/:id/like', action: fresh(likeAction) },
      { path: 'actions/conversations/:id/reply', action: fresh(replyAction) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
