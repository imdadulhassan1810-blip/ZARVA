"use client";
import { useEffect, useRef, useState } from "react";
import type { AuthProviders } from "@zarva/core";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, o: Record<string, unknown>): void;
        };
      };
    };
  }
}

/**
 * live: Google's official Sign-In button (Google Identity Services). It returns an ID token
 *       that the API verifies with Google's public keys.
 * mock: development stand-in. Asks for an email and name, no Google account involved.
 */
export function GoogleButton({ google, onToken }: { google: AuthProviders["google"]; onToken: (idToken: string) => Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (google.mode !== "live" || !google.clientId) return;
    const render = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: google.clientId!,
        callback: (r) => void onToken(r.credential).catch((e) => setError((e as Error).message)),
      });
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width: 320, text: "continue_with", shape: "pill" });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [google, onToken]);

  if (google.mode === "off") return null;
  if (google.mode === "live") {
    return (
      <div className="stack" style={{ alignItems: "center" }}>
        <div ref={ref} />
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }
  if (!demoOpen) {
    return (
      <button type="button" className="btn btn-google" onClick={() => setDemoOpen(true)}>
        <GoogleG /> Continue with Google
      </button>
    );
  }
  return (
    <form
      className="stack card"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onToken(`mock:${email.trim()}:${name.trim()}`);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        <strong>Demo Google sign-in.</strong> Real Google sign-in turns on when a Google client ID is set. Enter any Gmail address to try it.
      </p>
      <label>Gmail address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" autoFocus /></label>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn">Continue</button>
    </form>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.7 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
