import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type DocumentItem, type Usage, type User } from './api';
import { AskBox } from './AskBox';
import { Brand } from './Brand';
import { DocumentViewer } from './DocumentViewer';
import { SearchBox } from './SearchBox';
import { UploadBox } from './UploadBox';

const PAGE_SIZE = 20;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Viewing {
  document: { id: string; filename: string };
  page?: number;
  highlight?: string;
}

interface Passage {
  documentId: string;
  filename: string;
  pageNumber: number;
  content: string;
}

interface Props {
  user: User;
  onSignOut: () => void;
}

export function DocumentsScreen({ user, onSignOut }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'ask' | 'find'>('ask');
  const [usage, setUsage] = useState<Usage | null>(null);

  const loadUsage = useCallback(() => {
    api
      .usage()
      .then(setUsage)
      .catch(() => setUsage(null)); // only informational, so failing quietly is fine
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const load = useCallback(async () => {
    try {
      const list = await api.listDocuments(PAGE_SIZE, offset);
      // Deleting the last item on a page would otherwise show an empty page.
      if (list.items.length === 0 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
        return;
      }
      setDocuments(list.items);
      setTotal(list.total);
      setError('');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load documents',
      );
    }
  }, [offset]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep checking while the worker is busy, and stop once everything is done.
  const processing = documents?.some((d) => d.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [processing, load]);

  async function remove(document: DocumentItem) {
    if (
      !window.confirm(`Delete "${document.filename}"? This can't be undone.`)
    ) {
      return;
    }
    setDeletingId(document.id);
    try {
      await api.deleteDocument(document.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete');
    } finally {
      setDeletingId(null);
    }
  }

  function openPassage(passage: Passage) {
    setViewing({
      document: { id: passage.documentId, filename: passage.filename },
      page: passage.pageNumber,
      highlight: passage.content,
    });
  }

  const tabClass = (active: boolean) =>
    `rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-ink text-surface shadow-sm' : 'text-muted hover:text-ink'
    }`;

  return (
    <div className="workspace min-h-screen">
      <header className="workspace-header border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-8">
          <Brand />
          <div className="flex min-w-0 items-center gap-4 text-sm">
            <span className="truncate text-muted">{user.email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="shrink-0 font-medium transition-colors hover:text-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14 lg:py-14">
        <main className="workspace-main min-w-0">
          <p className="eyebrow">YOUR KNOWLEDGE, CONNECTED</p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
            Big questions.
            <br />
            <em className="workspace-highlight">Clear answers.</em>
          </h1>
          <p className="mt-2 mb-6 text-muted">
            Answers come from your library, and each one shows its page.
          </p>

          <div
            role="group"
            aria-label="Choose how to search"
            className="mb-3 inline-flex rounded-lg bg-line/60 p-1"
          >
            <button
              type="button"
              aria-pressed={tab === 'ask'}
              onClick={() => setTab('ask')}
              className={tabClass(tab === 'ask')}
            >
              Ask a question
            </button>
            <button
              type="button"
              aria-pressed={tab === 'find'}
              onClick={() => setTab('find')}
              className={tabClass(tab === 'find')}
            >
              Find passages
            </button>
          </div>

          {/* Both stay mounted, so switching tabs keeps what's on screen. */}
          <div hidden={tab !== 'ask'}>
            <AskBox onOpenSource={openPassage} onAnswered={loadUsage} />
          </div>
          <div hidden={tab !== 'find'}>
            <SearchBox onOpenResult={openPassage} />
          </div>

          {documents?.length === 0 && (
            <p className="mt-8 font-serif text-lg text-muted italic">
              Your library is empty. Add a document to get started.
            </p>
          )}
        </main>

        <aside className="library-panel min-w-0">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl tracking-tight">Library</h2>
            {documents && (
              <span className="text-sm text-muted">
                {total} {total === 1 ? 'document' : 'documents'}
              </span>
            )}
          </div>

          <UploadBox
            onUploaded={() => {
              void load();
              loadUsage();
            }}
          />

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}

          {documents === null && !error && (
            <p className="mt-5 text-muted">Loading…</p>
          )}

          {documents && documents.length > 0 && (
            <ul className="document-list mt-5">
              {documents.map((document) => (
                <li key={document.id} className="document-card py-3.5">
                  <p className="truncate font-medium" title={document.filename}>
                    {document.filename}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {document.status === 'ready' && (
                      <>
                        {document.pageCount}{' '}
                        {document.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                      </>
                    )}
                    {formatSize(document.sizeBytes)}
                    {document.visibility === 'public' && ' · Public'}
                  </p>

                  {document.status === 'processing' && (
                    <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-accent">
                      <span className="pulse-dot size-2 rounded-full bg-accent" />
                      Processing…
                    </p>
                  )}
                  {document.status === 'failed' && (
                    <p className="mt-1.5 text-sm break-words text-danger">
                      {document.error ?? 'Processing failed.'}
                    </p>
                  )}

                  <div className="mt-1.5 flex gap-4 text-sm font-medium">
                    {document.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => setViewing({ document })}
                        className="underline-offset-4 transition-colors hover:text-accent hover:underline"
                      >
                        Read
                      </button>
                    )}
                    {document.isOwner && (
                      <button
                        type="button"
                        disabled={deletingId === document.id}
                        onClick={() => void remove(document)}
                        className="text-muted underline-offset-4 transition-colors hover:text-danger hover:underline disabled:opacity-50"
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
                className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
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
                className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
              >
                Older
              </button>
            </nav>
          )}

          {usage && (
            <p className="usage-note mt-5 text-sm text-muted">
              Today: {usage.questionsUsed} of {usage.questionsLimit} questions,{' '}
              {usage.uploadsUsed} of {usage.uploadsLimit} uploads.
            </p>
          )}
        </aside>
      </div>

      {viewing && (
        <DocumentViewer
          key={viewing.document.id}
          document={viewing.document}
          initialPage={viewing.page}
          highlight={viewing.highlight}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
