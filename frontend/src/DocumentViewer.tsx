import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

interface Props {
  document: { id: string; filename: string }
  initialPage?: number
  highlight?: string
  onClose: () => void
}

export function DocumentViewer({
  document,
  initialPage,
  highlight,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const marked = useRef<HTMLElement>(null)
  const [pageNumbers, setPageNumbers] = useState<number[]>([])
  const [index, setIndex] = useState(0)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState('')

  const pageNumber = pageNumbers[index]

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    let current = true
    api
      .pageNumbers(document.id)
      .then((res) => {
        if (!current) return
        setPageNumbers(res.pageNumbers)
        const start = res.pageNumbers.indexOf(initialPage ?? -1)
        if (start !== -1) setIndex(start)
      })
      .catch((err: unknown) => {
        if (current) {
          setError(err instanceof ApiError ? err.message : 'Could not load pages')
        }
      })
    return () => {
      current = false
    }
  }, [document.id, initialPage])

  useEffect(() => {
    if (pageNumber === undefined) return
    // Ignores a slow response that arrives after the user has moved on.
    let current = true
    setContent(null)
    api
      .page(document.id, pageNumber)
      .then((page) => current && setContent(page.content))
      .catch((err: unknown) => {
        if (current) {
          setError(err instanceof ApiError ? err.message : 'Could not load page')
        }
      })
    return () => {
      current = false
    }
  }, [document.id, pageNumber])

  // The cited passage is only marked on the page it came from.
  const matchAt =
    content !== null && highlight && pageNumber === initialPage
      ? content.indexOf(highlight)
      : -1

  useEffect(() => {
    marked.current?.scrollIntoView({ block: 'center' })
  }, [matchAt])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={document.filename}
      className="m-auto h-[88vh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="truncate font-semibold">{document.filename}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-paper"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-12">
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : content === null ? (
            <p className="font-serif text-lg text-muted italic">Loading…</p>
          ) : (
            <p className="mx-auto max-w-[62ch] font-serif text-lg leading-relaxed break-words whitespace-pre-wrap">
              {matchAt === -1 || !highlight ? (
                content
              ) : (
                <>
                  {content.slice(0, matchAt)}
                  <mark ref={marked}>{highlight}</mark>
                  {content.slice(matchAt + highlight.length)}
                </>
              )}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="font-serif text-muted italic">
            {pageNumber === undefined ? '' : `Page ${pageNumber}`}
          </span>
          <button
            type="button"
            disabled={index >= pageNumbers.length - 1}
            onClick={() => setIndex(index + 1)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-40"
          >
            Next →
          </button>
        </footer>
      </div>
    </dialog>
  )
}
