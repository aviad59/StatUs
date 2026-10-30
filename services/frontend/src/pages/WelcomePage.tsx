import { useFetcher } from 'react-router'
import type { chooseGenderAction } from '@/actions.ts'
import type { Gender } from '@/types.ts'

const OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'אתה' },
  { value: 'female', label: 'את' },
]

/**
 * The first screen: how the characters should address the user in Hebrew. Chosen
 * once, since the story is written in that gender from here on.
 */
export function WelcomePage() {
  const fetcher = useFetcher<typeof chooseGenderAction>()
  const choosing = fetcher.state !== 'idle'
  const chosen = fetcher.formData?.get('gender')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">StatUs</h1>
        <p className="text-neutral-500">ברוכים הבאים לפלורנטין. השותפים כבר מחכים בדירה.</p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <p className="text-lg font-semibold">איך לפנות אליך?</p>
        <fetcher.Form method="post" action="/welcome" className="flex gap-3">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="submit"
              name="gender"
              value={option.value}
              disabled={choosing}
              className={`flex-1 rounded-xl border py-4 text-lg font-semibold transition-colors ${
                chosen === option.value
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-neutral-300 dark:border-neutral-700'
              } disabled:opacity-60`}
            >
              {option.label}
            </button>
          ))}
        </fetcher.Form>
        <p className="text-xs text-neutral-500">כך הדמויות יכתבו לך ועלייך. אי אפשר לשנות את זה אחר כך.</p>
        {fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok && (
          <p className="text-sm text-red-500">{fetcher.data.error}</p>
        )}
      </div>
    </div>
  )
}
