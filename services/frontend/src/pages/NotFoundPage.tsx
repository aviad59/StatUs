import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="space-y-2 px-4 pt-12 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p>
        הדף לא נמצא.{' '}
        <Link to="/" className="text-blue-500 underline">
          לדף הבית
        </Link>
      </p>
    </section>
  )
}
