import { useEffect, useRef, useState } from 'react'
import { api, ApiError, type DocumentItem } from './api'

interface Props {
  document: DocumentItem
  onClose: () => void
}

export function DocumentViewer({ document, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
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
      .then((res) => current && setPageNumbers(res.pageNumbers))
      .catch((err: unknown) => {
        if (current) {
          setError(err instanceof ApiError ? err.message : 'Could not load pages')
        }
      })
    return () => {
      current = false
    }
  }, [document.id])

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

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto h-[85vh] w-[calc(100%-2rem)] max-w-3xl rounded-lg bg-white p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <h2 className="truncate font-semibold">{document.filename}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="shrink-0 rounded-md border border-line px-3 py-1 text-sm hover:bg-paper"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : content === null ? (
            <p className="text-muted">Loading…</p>
          ) : (
            <p className="leading-relaxed break-words whitespace-pre-wrap">
              {content}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="rounded-md border border-line px-3 py-1 text-sm hover:bg-paper disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            {pageNumber === undefined ? '' : `Page ${pageNumber}`}
          </span>
          <button
            type="button"
            disabled={index >= pageNumbers.length - 1}
            onClick={() => setIndex(index + 1)}
            className="rounded-md border border-line px-3 py-1 text-sm hover:bg-paper disabled:opacity-40"
          >
            Next
          </button>
        </footer>
      </div>
    </dialog>
  )
}
