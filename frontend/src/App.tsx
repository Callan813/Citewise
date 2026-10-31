import { useEffect, useState } from 'react'
import { type AuthResponse, session, setUnauthorizedHandler, type User } from './api'
import { AuthScreen } from './AuthScreen'
import { DocumentsScreen } from './DocumentsScreen'

export default function App() {
  const [user, setUser] = useState<User | null>(() => session.user())

  // Any request that finds an expired token sends the user back to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
  }, [])

  function onAuthenticated(auth: AuthResponse) {
    session.save(auth)
    setUser(auth.user)
  }

  if (!user) return <AuthScreen onAuthenticated={onAuthenticated} />

  return (
    <DocumentsScreen
      user={user}
      onSignOut={() => {
        session.clear()
        setUser(null)
      }}
    />
  )
}
