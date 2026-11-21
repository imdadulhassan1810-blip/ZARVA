"use client";
import { useState } from "react";
import { api } from "../lib/api";

/** Second step for admins: the 6-digit code from their authenticator app (ADMIN_TOTP_SECRETS). */
export function AdminCodeForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form className="card stack" style={{ maxWidth: 420, margin: "32px auto" }} onSubmit={async (e) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        await api.adminUnlock(code);
        setCode("");
        onUnlocked();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }}>
      <h1 style={{ margin: 0 }}>Admin check</h1>
      <p className="muted" style={{ margin: 0 }}>Open your authenticator app and enter the 6-digit code for ZARVA Admin. You stay unlocked on this device for 8 hours.</p>
      <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Authenticator code" autoFocus />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || code.length !== 6}>Unlock admin</button>
    </form>
  );
}
