import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number>,
          ) => void;
        };
      };
    };
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let scriptLoading: Promise<void> | undefined;

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptLoading = undefined;
      reject(new Error('Could not load Google Sign-In'));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

interface Props {
  clientId: string;
  onCredential: (idToken: string) => void;
}

export function GoogleButton({ clientId, onCredential }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Always call the latest handler without re-creating Google's button.
  const handler = useRef(onCredential);
  useEffect(() => {
    handler.current = onCredential;
  });

  useEffect(() => {
    let current = true;
    let observer: ResizeObserver | undefined;
    loadGoogleScript()
      .then(() => {
        if (!current || !container.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => handler.current(response.credential),
        });
        const parent = container.current;
        let lastWidth = 0;
        const render = () => {
          const width = Math.min(400, Math.floor(parent.clientWidth));
          if (!current || width === lastWidth || width < 200) return;
          lastWidth = width;
          parent.replaceChildren();
          window.google?.accounts.id.renderButton(parent, {
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            width,
          });
        };
        render();
        observer = new ResizeObserver(render);
        observer.observe(parent);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
      observer?.disconnect();
    };
  }, [clientId]);

  if (failed) {
    return (
      <p className="text-sm text-muted">
        Google Sign-In couldn't load. You can still use your email.
      </p>
    );
  }
  return <div ref={container} className="flex min-h-10 justify-center" />;
}
