import { BookOpen, ChevronLeft, Clapperboard, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useOverlay } from '@/overlay.ts'
import { dismissHint, isHintDismissed } from '@/seen.ts'
import type { Chapter, Scene, StoryNow } from '@/types.ts'
import { Modal } from './Modal.tsx'
import { SceneCard } from './SceneCard.tsx'

/**
 * "The story right now", pinned at the top of the feed: which chapter it is, what's
 * going on in plain words, and what to do now. What happened in real life (the
 * chapter's scene, with its choice) pops up over the feed the first time (when `popUp`
 * allows it), and a row here opens it again. "The story so far" lists the earlier
 * chapters. `fresh`: the chapter just changed (a new one arrived).
 */
export function StoryPanel({
  story,
  fresh,
  onChosen,
  popUp,
}: {
  story: StoryNow
  fresh: boolean
  onChosen: () => void
  /** Whether a scene not seen yet may open by itself (not while the intro shows). */
  popUp: boolean
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { current, act } = story
  const scene = current?.scene
  // The scene open over the feed. A new one opens by itself, once: closing it marks it seen.
  const [openScene, setOpenScene] = useState<string | null>(null)
  if (scene && popUp && openScene !== scene.id && !isHintDismissed(sceneKey(scene))) setOpenScene(scene.id)
  const closeScene = () => {
    if (scene) dismissHint(sceneKey(scene))
    setOpenScene(null)
  }

  return (
    <section className="mx-3 mt-1 mb-2 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-950/30">
      <div className="space-y-1.5 px-4 pt-3 pb-3">
        <p className="text-[11px] font-bold tracking-wide text-amber-700 dark:text-amber-300">
          📖 {story.season.title}
          {act && ` · מערכה ${act.number} מתוך ${act.total}: ${act.title}`}
        </p>

        {current ? (
          <>
            <h2 className="flex items-center gap-2 text-base font-bold">
              פרק {current.number}: {current.title}
              {fresh && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-neutral-900">
                  חדש
                </span>
              )}
            </h2>
            {current.brief && <p className="text-[15px] leading-relaxed">{current.brief}</p>}
          </>
        ) : story.act ? (
          <p className="flex items-center gap-2 text-[15px]">
            <Loader2 size={15} className="animate-spin" />
            הפרק הבא נכתב עכשיו...
          </p>
        ) : (
          <p className="text-[15px]">העונה הסתיימה. החיים בדירה ממשיכים.</p>
        )}
        {current && story.writing && (
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <Loader2 size={14} className="animate-spin" />
            הפרק הבא נכתב...
          </p>
        )}
      </div>

      <div className="space-y-2 px-4 pb-3">
        {scene && <SceneRow scene={scene} onOpen={() => setOpenScene(scene.id)} />}
        {current?.hint && <Hint chapter={current} />}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200"
        >
          <BookOpen size={15} />
          הסיפור עד עכשיו
          {story.past.length > 0 && ` (${story.past.length} פרקים)`}
        </button>
      </div>

      {scene && openScene === scene.id && (
        <Modal onClose={closeScene}>
          <SceneCard scene={scene} onChosen={onChosen} />
        </Modal>
      )}
      {sheetOpen && <StorySoFar story={story} onClose={() => setSheetOpen(false)} />}
    </section>
  )
}

const sceneKey = (scene: Scene) => `scene-${scene.id}`

/** What happened in real life, as a row that opens it; marked while it still asks for a choice. */
function SceneRow({ scene, onOpen }: { scene: Scene; onOpen: () => void }) {
  const asking = scene.choices.length > 0 && !scene.chosen
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-start dark:bg-neutral-900"
    >
      <Clapperboard size={16} className="shrink-0 text-amber-700 dark:text-amber-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-amber-700 dark:text-amber-300">מה קרה במציאות</span>
        <span className="block truncate text-sm">{scene.place}</span>
      </span>
      {asking && (
        <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-neutral-900">
          מחכה להחלטה
        </span>
      )}
      <ChevronLeft size={16} className="shrink-0 text-neutral-400" />
    </button>
  )
}

/** What to do now, in plain words. */
function Hint({ chapter }: { chapter: Chapter }) {
  return (
    <p className="rounded-xl bg-white px-3 py-2 text-sm dark:bg-neutral-900">
      <span className="font-bold">👉 מה עושים: </span>
      {chapter.hint}
    </p>
  )
}

/** Every chapter so far, newest first: what happened, and what was decided. */
function StorySoFar({ story, onClose }: { story: StoryNow; onClose: () => void }) {
  useOverlay(onClose)

  const chapters = [...(story.current ? [story.current] : []), ...story.past]
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-md pb-10">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="flex-1 font-bold">הסיפור עד עכשיו</h2>
          <button type="button" onClick={onClose} aria-label="סגירה">
            <X size={24} />
          </button>
        </header>
        <div className="space-y-1 px-4 pt-4">
          <p className="font-bold">{story.season.title}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{story.season.logline}</p>
        </div>
        <ol className="space-y-5 px-4 pt-5">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="space-y-1.5 border-s-2 border-amber-300 ps-3 dark:border-amber-400/40">
              <p className="text-sm font-bold">
                פרק {chapter.number}: {chapter.title}
                {chapter.current && <span className="ms-2 text-xs text-amber-700 dark:text-amber-300">(עכשיו)</span>}
              </p>
              {chapter.brief && <p className="text-sm">{chapter.brief}</p>}
              {chapter.scene && (
                <div className="space-y-1 rounded-lg bg-amber-50 p-2.5 text-sm dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{chapter.scene.place}</p>
                  <p className="leading-relaxed">{chapter.scene.text}</p>
                  {chapter.scene.chosen && (
                    <p className="flex items-center gap-1 font-semibold">
                      <ChevronLeft size={14} />
                      הוחלט: {chapter.scene.choices.find((c) => c.key === chapter.scene!.chosen)?.label}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
