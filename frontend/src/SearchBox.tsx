import { type FormEvent, useState } from 'react'
import { api, ApiError, type SearchResponse } from './api'

export function SearchBox() {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setError('')
    try {
      setResponse(await api.search(query))
    } catch (err) {
      setResponse(null)
      setError(err instanceof ApiError ? err.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-semibold">Search your documents</h2>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="search"
          value={query}
          maxLength={500}
          aria-label="Search your documents"
          placeholder="Try describing what you're looking for"
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {response?.mode === 'keyword' && (
        <p className="mt-3 text-sm text-muted">
          Meaning-based search is unavailable right now, so these are keyword
          matches only.
        </p>
      )}

      {response?.results.length === 0 && (
        <p className="mt-3 text-muted">No matching passages found.</p>
      )}

      {response && response.results.length > 0 && (
        <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
          {response.results.map((result) => (
            <li key={result.chunkId} className="px-4 py-3">
              <p className="mb-1 text-sm font-medium break-words">
                {result.filename} · Page {result.pageNumber}
              </p>
              <p className="line-clamp-4 text-sm break-words whitespace-pre-wrap text-muted">
                {result.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
