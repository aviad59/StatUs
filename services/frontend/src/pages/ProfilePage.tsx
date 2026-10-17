import { Avatar } from '@/components/Avatar.tsx'
import { useCurrentUser } from '@/loaders.ts'

export function ProfilePage() {
  const currentUser = useCurrentUser()

  return (
    <section className="flex flex-col items-center gap-3 px-4 pt-12">
      <Avatar src={currentUser.avatarUrl} alt={currentUser.username} size={128} />
      <div className="text-center">
        <p className="font-semibold">{currentUser.name}</p>
        <p className="text-sm text-neutral-500">@{currentUser.username}</p>
      </div>
    </section>
  )
}
