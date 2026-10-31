import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError, type AuthResponse } from './api'
import { Brand } from './Brand'
import { GoogleButton } from './GoogleButton'

interface Props {
  onAuthenticated: (auth: AuthResponse) => void
}

const inputClass =
  'rounded-lg border border-line bg-surface px-3.5 py-2.5 text-base font-normal transition-colors focus:border-accent'

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)

  const isLogin = mode === 'login'

  // The button only appears when the backend has Google sign-in set up.
  useEffect(() => {
    api
      .authConfig()
      .then((config) => setGoogleClientId(config.googleClientId))
      .catch(() => setGoogleClientId(null))
  }, [])

  async function signInWithGoogle(idToken: string) {
    setBusy(true)
    setError('')
    try {
      onAuthenticated(await api.google(idToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const call = isLogin ? api.login : api.register
      onAuthenticated(await call(email, password))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <aside className="hidden flex-col justify-between border-r border-line px-14 py-12 lg:flex">
        <Brand large />

        <div className="max-w-xl">
          <h1 className="font-serif text-6xl leading-[1.05] font-normal tracking-tight">
            Ask your documents.
            <br />
            <em className="text-accent">Check every answer.</em>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Upload your notes and papers, ask in plain language, and see the
            exact page behind each answer.
          </p>

          <figure className="mt-10 rounded-xl border border-line bg-surface p-6 shadow-[0_18px_40px_-28px_rgb(60_40_10/0.5)]">
            <figcaption className="text-xs font-semibold tracking-widest text-muted uppercase">
              Example
            </figcaption>
            <p className="mt-3 text-sm text-muted">
              What separates 2NF from 3NF?
            </p>
            <p className="mt-2 font-serif text-xl leading-snug">
              2NF removes partial dependencies, while 3NF also removes
              transitive ones.<span className="citation">1</span>
            </p>
            <p className="mt-4 border-l-2 border-accent pl-3 text-sm text-muted">
              <span className="font-medium text-ink">1</span> · DBMS_Notes.pdf,
              page 14
            </p>
          </figure>
        </div>

        <p className="text-sm text-muted">
          Answers come only from what you upload.
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand large />
            <p className="mt-2 text-muted">
              Ask your documents. Check every answer.
            </p>
          </div>

          <h2 className="font-serif text-3xl tracking-tight">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 mb-7 text-muted">
            {isLogin
              ? 'Sign in to your library.'
              : 'Start your own library in a minute.'}
          </p>

          {googleClientId && (
            <div className="mb-6">
              <GoogleButton
                clientId={googleClientId}
                onCredential={(idToken) => void signInWithGoogle(idToken)}
              />
              <div className="mt-6 flex items-center gap-3 text-sm text-muted">
                <span className="h-px flex-1 bg-line" />
                or use your email
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Password
              <input
                type="password"
                required
                minLength={isLogin ? undefined : 8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {!isLogin && (
                <span className="font-normal text-muted">
                  At least 8 characters.
                </span>
              )}
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 font-semibold text-on-accent transition-colors hover:bg-accent-dark disabled:opacity-60"
            >
              {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(isLogin ? 'register' : 'login')
              setError('')
            }}
            className="mt-5 text-sm text-muted transition-colors hover:text-ink"
          >
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <span className="font-semibold text-accent underline underline-offset-4">
              {isLogin ? 'Create an account' : 'Sign in'}
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}
