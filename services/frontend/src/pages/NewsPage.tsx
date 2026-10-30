import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLoaderData } from 'react-router'
import { timeAgo } from '@/format.ts'
import type { NewsArticle, newsLoader } from '@/loaders.ts'

/**
 * Pull (פול): the made-up news site on the phone. Every article has the same format: a
 * category, a headline, a subheadline and a photo (made ahead of time). The newest is
 * the lead story; the rest are a list. Tapping one opens it in full.
 */
export function NewsPage() {
  const articles = useLoaderData<typeof newsLoader>()
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const open = articles.find((a) => a.slug === openSlug)
  const [lead, ...rest] = articles

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <Masthead />
      {lead && (
        <button type="button" onClick={() => setOpenSlug(lead.slug)} className="block w-full text-start">
          <img src={lead.image} alt="" className="aspect-video w-full bg-neutral-200 object-cover dark:bg-neutral-800" />
          <div className="space-y-1.5 bg-white px-4 pt-3 pb-4 dark:bg-neutral-900">
            <Category name={lead.category} />
            <h2 className="text-xl leading-snug font-extrabold">{lead.title}</h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300">{lead.subtitle}</p>
            <p className="text-xs text-neutral-500">{timeAgo(lead.publishedAt)}</p>
          </div>
        </button>
      )}

      <ul className="mt-2 divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
        {rest.map((article) => (
          <li key={article.slug}>
            <button
              type="button"
              onClick={() => setOpenSlug(article.slug)}
              className="flex w-full gap-3 px-4 py-3 text-start"
            >
              <img
                src={article.image}
                alt=""
                loading="lazy"
                className="aspect-video w-32 shrink-0 rounded-md bg-neutral-200 object-cover dark:bg-neutral-800"
              />
              <div className="min-w-0 space-y-1">
                <Category name={article.category} />
                <h3 className="line-clamp-3 text-[15px] leading-snug font-bold">{article.title}</h3>
                <p className="text-xs text-neutral-500">{timeAgo(article.publishedAt)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {open && <ArticleView article={open} onClose={() => setOpenSlug(null)} />}
    </div>
  )
}

/** The site's own wordmark and colors (deliberately not any real news site's). */
function Masthead() {
  return (
    <header className="flex items-baseline justify-between bg-slate-900 px-4 py-3 text-white">
      <p dir="ltr" className="text-3xl font-black tracking-tight">
        pull<span className="text-amber-400">.</span>
      </p>
      <p className="text-xs text-slate-300">החדשות שמושכות אותך</p>
    </header>
  )
}

function Category({ name }: { name: string }) {
  return <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{name}</p>
}

/** One article in full, over the list. Back (or Escape) returns to it. */
function ArticleView({ article, onClose }: { article: NewsArticle; onClose: () => void }) {
  // Keep the list behind from scrolling, and close on Escape.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-white dark:bg-neutral-950">
      <article className="mx-auto max-w-md pb-16">
        <header className="sticky top-0 z-10 flex items-center gap-2 bg-slate-900 px-2 py-2 text-white">
          <button type="button" onClick={onClose} aria-label="חזרה">
            <ChevronRight size={28} />
          </button>
          <p dir="ltr" className="text-xl font-black tracking-tight">
            pull<span className="text-amber-400">.</span>
          </p>
        </header>
        <div className="space-y-2 px-4 pt-4">
          <Category name={article.category} />
          <h1 className="text-2xl leading-snug font-extrabold">{article.title}</h1>
          <p className="text-base text-neutral-600 dark:text-neutral-300">{article.subtitle}</p>
          <p className="text-xs text-neutral-500">מערכת Pull · {timeAgo(article.publishedAt)}</p>
        </div>
        <img src={article.image} alt="" className="mt-4 aspect-video w-full bg-neutral-200 object-cover dark:bg-neutral-800" />
        <p className="px-4 pt-4 text-[17px] leading-relaxed">{article.lead}</p>
      </article>
    </div>
  )
}
