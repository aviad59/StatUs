import { ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import type { createPostAction } from '@/actions.ts'
import { resizeImage } from '@/image.ts'

/** Pick a photo, write a caption, share. The photo is resized on the phone before upload. */
export function NewPostPage() {
  const fetcher = useFetcher<typeof createPostAction>()
  const inputRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sharing = fetcher.state !== 'idle'

  // Free the preview's object URL when it's replaced or the page closes.
  useEffect(() => {
    if (!image) return
    return () => URL.revokeObjectURL(image.url)
  }, [image])

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const blob = await resizeImage(file)
      setImage({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setError('לא הצלחנו לפתוח את התמונה הזאת. נסו תמונה אחרת.')
    }
  }

  const share = () => {
    if (!image || sharing) return
    const form = new FormData()
    form.append('image', image.blob, 'photo.jpg')
    form.append('caption', caption.trim())
    void fetcher.submit(form, { method: 'post', action: '/new', encType: 'multipart/form-data' })
  }

  const failed = fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok ? fetcher.data.error : null

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <Link to="/" aria-label="ביטול">
          <X size={26} />
        </Link>
        <h1 className="font-semibold">פוסט חדש</h1>
        <button
          type="button"
          onClick={share}
          disabled={!image || sharing}
          className="font-semibold text-blue-500 disabled:opacity-40"
        >
          {sharing ? 'משתפים...' : 'שיתוף'}
        </button>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={sharing}
        className="relative aspect-square w-full bg-neutral-100 dark:bg-neutral-900"
      >
        {image ? (
          <>
            <img src={image.url} alt="" className="h-full w-full object-cover" />
            <span className="absolute end-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              החלפת תמונה
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
            <ImagePlus size={48} strokeWidth={1.5} />
            <span className="text-sm">בחירת תמונה מהגלריה</span>
          </span>
        )}
      </button>

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={2200}
        rows={3}
        placeholder="כתיבת כיתוב..."
        disabled={sharing}
        className="w-full resize-none bg-transparent p-3 text-sm outline-none"
      />

      {(error || failed) && <p className="px-3 text-sm text-red-500">{error ?? failed}</p>}
    </div>
  )
}
