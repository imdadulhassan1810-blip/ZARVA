"use client";
import { useState } from "react";
import type { AuthProviders } from "@zarva/core";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init(o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
        signIn(): Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
      };
    };
  }
}

const APPLE_JS = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

function loadAppleJs(): Promise<void> {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = APPLE_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Sign in with Apple"));
    document.head.appendChild(s);
  });
}

/**
 * live: Apple's sign-in popup (Sign in with Apple JS). Returns an identity token the API verifies
 *       with Apple's public keys. The name comes only on the first sign-in, so we pass it along.
 * mock: development stand-in. Asks for an email, no Apple account involved.
 */
export function AppleButton({ apple, onToken }: { apple: AuthProviders["apple"]; onToken: (token: string, name?: string) => Promise<void> }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (apple.mode === "off") return null;

  const live = async () => {
    setError(null);
    setBusy(true);
    try {
      await loadAppleJs();
      window.AppleID!.auth.init({ clientId: apple.serviceId!, scope: "name email", redirectURI: `${window.location.origin}/login`, usePopup: true });
      const r = await window.AppleID!.auth.signIn();
      const n = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(" ");
      await onToken(r.authorization.id_token, n || undefined);
    } catch (e) {
      // Closing the popup is not an error worth showing.
      const msg = (e as { error?: string; message?: string }).error ?? (e as Error).message;
      if (msg && msg !== "popup_closed_by_user") setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (apple.mode === "live" || !demoOpen) {
    return (
      <div className="stack">
        <button type="button" className="btn launch-btn" disabled={busy} onClick={() => (apple.mode === "live" ? void live() : setDemoOpen(true))}>
          <AppleLogo /> Continue with Apple
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <form
      className="stack launch-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onToken(`mock:${email.trim()}`, name.trim() || undefined);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        <strong>Demo Apple sign-in.</strong> Real Sign in with Apple turns on when an Apple Services ID is set. Enter any email to try it.
      </p>
      <label>Apple ID email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@icloud.com" autoFocus /></label>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn">Continue</button>
    </form>
  );
}

export function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.68-1.1 1.77-.96 2.81 1.02.08 2.05-.52 2.69-1.29z" />
    </svg>
  );
}
