import { type FormEvent, useState } from 'react'
import { api, ApiError, type AuthResponse } from './api'

interface Props {
  onAuthenticated: (auth: AuthResponse) => void
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isLogin = mode === 'login'

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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Document Intelligence</h1>
      <p className="mt-1 mb-8 text-muted">
        {isLogin ? 'Sign in to your documents.' : 'Create your account.'}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
          />
          {!isLogin && (
            <span className="font-normal text-muted">At least 8 characters.</span>
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
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-dark disabled:opacity-60"
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
        className="mt-5 self-start text-sm text-accent underline underline-offset-2"
      >
        {isLogin ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </main>
  )
}
