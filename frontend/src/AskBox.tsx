import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { api, ApiError, type AskSource } from './api'

interface Props {
  onOpenSource: (source: AskSource) => void
  onAnswered: () => void
}

export function AskBox({ onOpenSource, onAnswered }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<AskSource[]>([])
  const [keywordOnly, setKeywordOnly] = useState(false)
  const [cached, setCached] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stopper = useRef<AbortController | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || busy) return

    const controller = new AbortController()
    stopper.current = controller
    setBusy(true)
    setAnswer('')
    setSources([])
    setKeywordOnly(false)
    setCached(false)
    setError('')
    try {
      const result = await api.askStream(
        question,
        (text) => setAnswer((current) => current + text),
        controller.signal,
      )
      setSources(result.sources)
      setKeywordOnly(result.mode === 'keyword')
      setCached(result.cached)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
      }
    } finally {
      setBusy(false)
      onAnswered()
    }
  }

  // Turns citations like [2] into marks that open that page once sources arrive.
  function renderAnswer(text: string): ReactNode[] {
    return text.split(/(\[\d+\])/g).map((part, i) => {
      const number = /^\[(\d+)\]$/.exec(part)?.[1]
      if (!number) return part
      const source = sources.find((s) => String(s.number) === number)
      if (!source) {
        return (
          <span key={i} className="citation">
            {number}
          </span>
        )
      }
      return (
        <button
          key={i}
          type="button"
          aria-label={`Source ${number}: ${source.filename}, page ${source.pageNumber}`}
          title={`${source.filename}, page ${source.pageNumber}`}
          onClick={() => onOpenSource(source)}
          className="citation"
        >
          {number}
        </button>
      )
    })
  }

  return (
    <div>
      <form
        onSubmit={submit}
        className="flex gap-2 rounded-xl border border-line bg-surface p-2 shadow-[0_14px_30px_-24px_rgb(60_40_10/0.6)] transition-colors focus-within:border-accent"
      >
        <input
          type="text"
          value={question}
          maxLength={500}
          aria-label="Ask a question about your documents"
          placeholder="What is the difference between 2NF and 3NF?"
          onChange={(e) => setQuestion(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-serif text-lg outline-none placeholder:text-muted"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stopper.current?.abort()}
            className="shrink-0 rounded-lg border border-line px-5 py-2 font-semibold transition-colors hover:bg-paper"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-5 py-2 font-semibold text-on-accent transition-colors hover:bg-accent-dark"
          >
            Ask
          </button>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-4 break-words text-danger">
          {error}
        </p>
      )}

      {busy && !answer && (
        <p role="status" className="mt-6 font-serif text-lg text-muted italic">
          Reading your documents…
        </p>
      )}

      {answer && (
        <article className="rise mt-8">
          <p
            aria-live="polite"
            className={`font-serif text-2xl leading-relaxed break-words whitespace-pre-wrap ${
              busy ? 'caret' : ''
            }`}
          >
            {renderAnswer(answer)}
          </p>

          {sources.length > 0 && (
            <section className="mt-8">
              <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">
                Sources
              </h3>
              <ol className="grid gap-3">
                {sources.map((source) => (
                  <li key={source.number}>
                    <button
                      type="button"
                      onClick={() => onOpenSource(source)}
                      className="group w-full rounded-r-lg border-l-2 border-accent bg-surface px-4 py-3 text-left transition-colors hover:bg-paper"
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                        <span className="min-w-0 font-semibold break-all">
                          <span className="citation ml-0">{source.number}</span>{' '}
                          {source.filename}
                        </span>
                        <span className="shrink-0 font-medium text-accent group-hover:underline">
                          Open page {source.pageNumber} →
                        </span>
                      </span>
                      <span className="mt-1.5 line-clamp-2 font-serif break-words text-muted">
                        {source.content}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {keywordOnly && (
            <p className="mt-4 text-sm text-muted">
              Meaning-based search was unavailable, so this used keyword matches
              only.
            </p>
          )}
          {!busy && sources.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              {cached && 'Answered from a recent identical question. '}
              AI answers can be wrong. Check the sources.
            </p>
          )}
        </article>
      )}
    </div>
  )
}
