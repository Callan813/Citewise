import { useEffect, useState } from 'react';
import {
  type AuthResponse,
  session,
  setUnauthorizedHandler,
  type User,
} from './api';
import { LandingScreen } from './LandingScreen';
import { AuthScreen } from './AuthScreen';
import { DocumentsScreen } from './DocumentsScreen';

export default function App() {
  const [user, setUser] = useState<User | null>(() => session.user());

  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);

  // Any request that finds an expired token sends the user back to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthMode('login');
      setUser(null);
    });
    return () => setUnauthorizedHandler(() => {});
  }, []);

  function onAuthenticated(auth: AuthResponse) {
    session.save(auth);
    setUser(auth.user);
  }

  if (!user)
    return authMode ? (
      <AuthScreen
        initialMode={authMode}
        onBack={() => setAuthMode(null)}
        onAuthenticated={onAuthenticated}
      />
    ) : (
      <LandingScreen onStart={setAuthMode} />
    );

  return (
    <DocumentsScreen
      user={user}
      onSignOut={() => {
        session.clear();
        setUser(null);
        setAuthMode(null);
      }}
    />
  );
}
