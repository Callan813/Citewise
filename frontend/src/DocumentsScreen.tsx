import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type DocumentItem, type User } from './api'
import { DocumentViewer } from './DocumentViewer'
import { SearchBox } from './SearchBox'
import { UploadBox } from './UploadBox'

const PAGE_SIZE = 20

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  user: User
  onSignOut: () => void
}

export function DocumentsScreen({ user, onSignOut }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<DocumentItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.listDocuments(PAGE_SIZE, offset)
      // Deleting the last item on a page would otherwise show an empty page.
      if (list.items.length === 0 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE))
        return
      }
      setDocuments(list.items)
      setTotal(list.total)
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load documents')
    }
  }, [offset])

  useEffect(() => {
    void load()
  }, [load])

  // Keep checking while the worker is busy, and stop once everything is done.
  const processing = documents?.some((d) => d.status === 'processing') ?? false
  useEffect(() => {
    if (!processing) return
    const timer = setInterval(() => void load(), 2000)
    return () => clearInterval(timer)
  }, [processing, load])

  async function remove(document: DocumentItem) {
    if (!window.confirm(`Delete "${document.filename}"? This can't be undone.`)) {
      return
    }
    setDeletingId(document.id)
    try {
      await api.deleteDocument(document.id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">Citewise</h1>
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="truncate text-muted">{user.email}</span>
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 text-accent underline underline-offset-2"
          >
            Sign out
          </button>
        </div>
      </header>

      <UploadBox onUploaded={() => void load()} />

      <SearchBox />

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">
          Documents{documents ? ` (${total})` : ''}
        </h2>

        {error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {error}
          </p>
        )}

        {documents === null && !error && <p className="text-muted">Loading…</p>}

        {documents?.length === 0 && (
          <p className="text-muted">No documents yet. Upload one above.</p>
        )}

        {documents && documents.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium">{document.filename}</p>
                  <p className="text-sm text-muted">
                    {document.status === 'ready' && (
                      <>
                        {document.pageCount}{' '}
                        {document.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                      </>
                    )}
                    {document.status === 'processing' && (
                      <span className="font-medium text-accent">
                        Processing… ·{' '}
                      </span>
                    )}
                    {formatSize(document.sizeBytes)} ·{' '}
                    {new Date(document.uploadDate).toLocaleDateString()}
                    {document.visibility === 'public' && ' · Public'}
                  </p>
                  {document.status === 'failed' && (
                    <p className="mt-1 text-sm break-words text-danger">
                      {document.error ?? 'Processing failed.'}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {document.status === 'ready' && (
                    <button
                      type="button"
                      onClick={() => setViewing(document)}
                      className="rounded-md border border-line px-3 py-1 text-sm hover:bg-paper"
                    >
                      Read
                    </button>
                  )}
                  {document.isOwner && (
                    <button
                      type="button"
                      disabled={deletingId === document.id}
                      onClick={() => void remove(document)}
                      className="rounded-md border border-line px-3 py-1 text-sm text-danger hover:bg-paper disabled:opacity-50"
                    >
                      {deletingId === document.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <nav className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(offset - PAGE_SIZE)}
              className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
            >
              Newer
            </button>
            <span className="text-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
            >
              Older
            </button>
          </nav>
        )}
      </section>

      {viewing && (
        <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
