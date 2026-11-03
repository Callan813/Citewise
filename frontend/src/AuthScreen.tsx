import { type FormEvent, useEffect, useState } from 'react';
import { api, ApiError, type AuthResponse } from './api';
import { Brand } from './Brand';
import { OrbitArt } from './LandingScreen';
import { GoogleButton } from './GoogleButton';

interface Props {
  initialMode?: 'login' | 'register';
  onBack: () => void;
  onAuthenticated: (auth: AuthResponse) => void;
}

const inputClass =
  'rounded-lg border border-line bg-surface px-3.5 py-2.5 text-base font-normal transition-colors focus:border-accent';

export function AuthScreen({
  onAuthenticated,
  initialMode = 'login',
  onBack,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  const isLogin = mode === 'login';

  // The button only appears when the backend has Google sign-in set up.
  useEffect(() => {
    api
      .authConfig()
      .then((config) => setGoogleClientId(config.googleClientId))
      .catch(() => setGoogleClientId(null));
  }, []);

  async function signInWithGoogle(idToken: string) {
    setBusy(true);
    setError('');
    try {
      onAuthenticated(await api.google(idToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const call = isLogin ? api.login : api.register;
      onAuthenticated(await call(email, password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="site-header page-width">
        <button onClick={onBack} aria-label="Citewise home">
          <Brand large />
        </button>
        <button className="button outline" onClick={onBack}>
          Back to home ↗
        </button>
      </header>
      <div className="auth-layout page-width">
        <aside className="auth-story">
          <p className="eyebrow">YOUR DOCUMENT LIBRARY</p>
          <h1>
            A little curiosity.
            <br />
            <span>A lot of clarity.</span>
          </h1>
          <p>
            All your notes. Better questions. Answers you can trace back to the
            page.
          </p>
          <OrbitArt />
        </aside>
        <main className="auth-card">
          <span className="auth-badge">CITEWISE</span>
          <h2>{isLogin ? 'Welcome back.' : 'Let’s get curious.'}</h2>
          <p className="mt-2 mb-7 text-muted">
            {isLogin
              ? 'Sign in to your library.'
              : 'Start with your notes or the shared library.'}
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
              {busy ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(isLogin ? 'register' : 'login');
              setError('');
            }}
            className="mt-5 text-sm text-muted transition-colors hover:text-ink"
          >
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <span className="font-semibold text-accent underline underline-offset-4">
              {isLogin ? 'Create an account' : 'Sign in'}
            </span>
          </button>
        </main>
      </div>
    </div>
  );
}
