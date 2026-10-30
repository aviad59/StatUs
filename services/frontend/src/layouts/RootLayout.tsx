import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { BottomNav } from '@/components/BottomNav.tsx'
import { StatsToast } from '@/components/StatsBar.tsx'
import { prefetchTabs, useCurrentUser } from '@/loaders.ts'

export function RootLayout() {
  useEffect(prefetchTabs, [])
  const currentUser = useCurrentUser()
  const { pathname } = useLocation()

  // New users choose how to be addressed before anything else.
  const welcome = pathname === '/welcome'
  if (!currentUser.gender && !welcome) return <Navigate to="/welcome" replace />
  if (currentUser.gender && welcome) return <Navigate to="/" replace />
  if (welcome) return <Outlet />
  // A chat fills the screen above the keyboard, like real chat apps: no bottom nav (ConversationPage).
  if (/^\/messages\/[^/]+$/.test(pathname)) {
    return (
      <div className="min-h-dvh bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <main className="mx-auto min-h-dvh max-w-md pb-14 sm:border-x sm:border-neutral-200 sm:dark:border-neutral-800">
        <Outlet />
      </main>
      <StatsToast />
      <BottomNav />
    </div>
  )
}
