import { Home, MessageCircle, SquarePen } from 'lucide-react'
import { NavLink } from 'react-router'
import { useCurrentUser, useUnreadCount } from '@/loaders.ts'
import { Avatar } from './Avatar.tsx'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 items-center justify-center py-3 ${isActive ? 'opacity-100' : 'opacity-50'}`

export function BottomNav() {
  const currentUser = useCurrentUser()
  const unread = useUnreadCount()

  return (
    // Not mirrored, like Instagram's Hebrew UI: home on the left, profile on the right.
    <nav
      dir="ltr"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
    >
      <NavLink to="/" end className={linkClass} aria-label="בית">
        <Home size={24} />
      </NavLink>
      <NavLink to="/new" className={linkClass} aria-label="פוסט חדש">
        <SquarePen size={24} />
      </NavLink>
      <NavLink to="/messages" className={linkClass} aria-label={unread ? `הודעות, ${unread} לא נקראו` : 'הודעות'}>
        <span className="relative">
          <MessageCircle size={24} />
          {unread > 0 && (
            <span className="absolute -end-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-neutral-950">
              {unread}
            </span>
          )}
        </span>
      </NavLink>
      <NavLink to="/profile" className={linkClass} aria-label="פרופיל">
        <Avatar src={currentUser.avatarUrl} alt="פרופיל" size={26} />
      </NavLink>
    </nav>
  )
}
