import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-bold">404</h1>
      <p>
        Page not found.{' '}
        <Link to="/" className="text-blue-600 underline">
          Go home
        </Link>
      </p>
    </section>
  )
}
