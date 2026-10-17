import { useRouteError } from 'react-router'

// Shown when a loader fails, usually because the backend isn't running.
export function ErrorPage() {
  console.error(useRouteError())

  return (
    <section className="min-h-dvh space-y-2 bg-white px-4 pt-12 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <h1 className="text-2xl font-bold">משהו השתבש</h1>
      <p className="text-neutral-500">לא הצלחנו להתחבר לשרת. נסו שוב בעוד רגע.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-blue-500 underline"
      >
        רענון
      </button>
    </section>
  )
}
