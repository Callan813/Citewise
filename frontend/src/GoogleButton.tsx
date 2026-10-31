import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number>,
          ) => void
        }
      }
    }
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google Sign-In'))
    document.head.appendChild(script)
  })
}

interface Props {
  clientId: string
  onCredential: (idToken: string) => void
}

export function GoogleButton({ clientId, onCredential }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  // Always call the latest handler without re-creating Google's button.
  const handler = useRef(onCredential)
  useEffect(() => {
    handler.current = onCredential
  })

  useEffect(() => {
    let current = true
    loadGoogleScript()
      .then(() => {
        if (!current || !container.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => handler.current(response.credential),
        })
        window.google.accounts.id.renderButton(container.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
        })
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [clientId])

  if (failed) {
    return (
      <p className="text-sm text-muted">
        Google Sign-In couldn't load. You can still use your email.
      </p>
    )
  }
  return <div ref={container} className="flex min-h-10 justify-center" />
}
