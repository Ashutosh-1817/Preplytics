import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Loads Google's sign-in script once, however many times this component mounts
let scriptPromise = null;
const loadGoogleScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
};

// "Continue with Google". onCredential(idToken) is called when the user picks an account.
// Renders nothing when VITE_GOOGLE_CLIENT_ID is not set, so the app works without it.
function GoogleSignInButton({ onCredential, text = 'continue_with' }) {
  const holder = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(holder.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          width: Math.min(holder.current.offsetWidth || 336, 400),
        });
      })
      .catch(() => {
        // Script blocked or offline: quietly hide the button, email sign-in still works
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [onCredential, text]);

  if (!CLIENT_ID || failed) return null;

  return <div ref={holder} className="google-btn-holder" />;
}

export default GoogleSignInButton;