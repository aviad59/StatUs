import { Home, MessageCircle } from 'lucide-react'
import { NavLink } from 'react-router'
import { useCurrentUser } from '@/loaders.ts'
import { Avatar } from './Avatar.tsx'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 items-center justify-center py-3 ${isActive ? 'opacity-100' : 'opacity-50'}`

export function BottomNav() {
  const currentUser = useCurrentUser()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <NavLink to="/" end className={linkClass} aria-label="בית">
        <Home size={24} />
      </NavLink>
      <NavLink to="/messages" className={linkClass} aria-label="הודעות">
        <MessageCircle size={24} />
      </NavLink>
      <NavLink to="/profile" className={linkClass} aria-label="פרופיל">
        <Avatar src={currentUser.avatarUrl} alt="פרופיל" size={26} />
      </NavLink>
    </nav>
  )
}
