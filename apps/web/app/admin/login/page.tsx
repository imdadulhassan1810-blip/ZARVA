"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi } from "../../../lib/api";
import { areaHome, safeNext } from "../../../lib/roles";

/**
 * Admin app sign-in with a ZARVA-issued login: username, password and the 6-digit code from the
 * authenticator app. There is no sign-up: an existing admin creates logins in the Team tab.
 */
export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminApi.adminLogin(username.trim(), password, code);
      router.replace(safeNext("admin") ?? areaHome.admin);
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>ZARVA Admin</h1>
      <p className="muted">For the ZARVA team. Use the login ZARVA gave you.</p>
      <form className="card stack" onSubmit={submit}>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        <label>6-digit code from your authenticator app
          <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
        </label>
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <button className="btn" disabled={busy || !username || !password}>{busy ? "Checking…" : "Sign in"}</button>
      </form>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Lost your password or phone? Ask another ZARVA admin to disable this login and create a new one.</p>
    </div>
  );
}
