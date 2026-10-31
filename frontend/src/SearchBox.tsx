import { type FormEvent, useState } from 'react'
import { api, ApiError, type SearchResponse } from './api'

type SearchResult = SearchResponse['results'][number]

interface Props {
  onOpenResult: (result: SearchResult) => void
}

export function SearchBox({ onOpenResult }: Props) {
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
    <div>
      <form
        onSubmit={submit}
        className="flex gap-2 rounded-xl border border-line bg-surface p-2 shadow-[0_14px_30px_-24px_rgb(60_40_10/0.6)] transition-colors focus-within:border-accent"
      >
        <input
          type="search"
          value={query}
          maxLength={500}
          aria-label="Find passages in your documents"
          placeholder="Describe the passage you're looking for"
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-serif text-lg outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-accent px-5 py-2 font-semibold text-on-accent transition-colors hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? 'Finding…' : 'Find'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}

      {response?.mode === 'keyword' && (
        <p className="mt-4 text-sm text-muted">
          Meaning-based search is unavailable right now, so these are keyword
          matches only.
        </p>
      )}

      {response?.results.length === 0 && (
        <p className="mt-6 font-serif text-lg text-muted italic">
          No matching passages found.
        </p>
      )}

      {response && response.results.length > 0 && (
        <ol className="rise mt-6 grid gap-3">
          {response.results.map((result) => (
            <li key={result.chunkId}>
              <button
                type="button"
                onClick={() => onOpenResult(result)}
                className="group w-full rounded-r-lg border-l-2 border-accent bg-surface px-4 py-3 text-left transition-colors hover:bg-paper"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="min-w-0 font-semibold break-all">
                    {result.filename}
                  </span>
                  <span className="shrink-0 font-medium text-accent group-hover:underline">
                    Open page {result.pageNumber} →
                  </span>
                </span>
                <span className="mt-1.5 line-clamp-4 font-serif break-words whitespace-pre-wrap text-muted">
                  {result.content}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
