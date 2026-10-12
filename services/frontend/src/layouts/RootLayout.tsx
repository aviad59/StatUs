import { Outlet } from 'react-router'
import { BottomNav } from '@/components/BottomNav.tsx'

export function RootLayout() {
  return (
    <div className="min-h-dvh bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <main className="mx-auto min-h-dvh max-w-md pb-14 sm:border-x sm:border-neutral-200 sm:dark:border-neutral-800">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
