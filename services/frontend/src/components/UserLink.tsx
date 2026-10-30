import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCurrentUser } from '@/loaders.ts'
import type { User } from '@/types.ts'

/** Wraps an avatar or username so tapping it opens that person's profile (yours is /profile). */
export function UserLink({ user, className, children }: { user: User; className?: string; children: ReactNode }) {
  const currentUser = useCurrentUser()
  const to = user.id === currentUser.id ? '/profile' : `/u/${encodeURIComponent(user.username)}`
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}
