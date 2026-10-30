import { Check, Clapperboard } from 'lucide-react'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import type { chooseSceneAction } from '@/actions.ts'
import { timeAgo } from '@/format.ts'
import { useCurrentUser } from '@/loaders.ts'
import type { Scene } from '@/types.ts'

/**
 * What happened in real life (off the network) in the current chapter, narrated to the
 * user, who was there. Shown inside the story card (StoryPanel). It ends with "what do
 * you do?": the user's pick (optimistic) moves the story on; `onChosen` tells the feed
 * to watch for the next chapter.
 */
export function SceneCard({ scene, onChosen }: { scene: Scene; onChosen: () => void }) {
  const fetcher = useFetcher<typeof chooseSceneAction>()
  const female = useCurrentUser().gender === 'female'
  const sending = fetcher.formData?.get('choice')
  const chosen = typeof sending === 'string' ? sending : scene.chosen
  const failed = fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok ? fetcher.data.error : null

  const done = fetcher.state === 'idle' && fetcher.data?.ok
  useEffect(() => {
    if (done) onChosen()
  }, [done, onChosen])

  return (
    <article
      id={`scene-${scene.id}`}
      className="border-y border-amber-200 bg-white dark:border-amber-400/20 dark:bg-neutral-900"
    >
      <header className="space-y-0.5 px-4 pt-3 pb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-amber-700 dark:text-amber-300">
          <Clapperboard size={13} />
          מה קרה במציאות
        </p>
        <p className="text-sm font-semibold">{scene.place}</p>
      </header>
      {scene.imageUrl && (
        <img
          src={scene.imageUrl}
          alt=""
          className="aspect-[4/3] w-full bg-amber-100 object-cover dark:bg-amber-900/30"
        />
      )}
      <p className="px-4 pt-3 text-[15px] leading-relaxed whitespace-pre-line">{scene.text}</p>

      {scene.choices.length > 0 && (
        <fetcher.Form method="post" action={`/actions/scenes/${scene.id}/choose`} className="space-y-2 px-4 pt-3">
          <p className="text-sm font-bold">{chosen ? 'מה עשית' : female ? 'ומה את עושה?' : 'ומה אתה עושה?'}</p>
          {scene.choices.map((choice) => {
            const picked = chosen === choice.key
            return (
              <button
                key={choice.key}
                type="submit"
                name="choice"
                value={choice.key}
                disabled={Boolean(chosen)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-semibold transition active:scale-[0.99] ${
                  picked
                    ? 'border-amber-500 bg-amber-400 text-neutral-900'
                    : chosen
                      ? 'border-transparent text-neutral-400 line-through dark:text-neutral-600'
                      : 'border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-neutral-950 dark:hover:bg-neutral-800'
                }`}
              >
                {picked && <Check size={16} className="shrink-0" />}
                {choice.label}
              </button>
            )
          })}
          {failed && <p className="text-sm text-red-500">{failed}</p>}
        </fetcher.Form>
      )}
      <p className="px-4 pt-2 pb-3 text-xs text-neutral-500">{timeAgo(scene.createdAt)}</p>
    </article>
  )
}
