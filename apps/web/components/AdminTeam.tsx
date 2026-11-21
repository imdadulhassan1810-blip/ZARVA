"use client";
import { useCallback, useEffect, useState } from "react";
import type { AdminAccount, AdminCreated } from "@zarva/core";
import { adminApi } from "../lib/api";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "never");

/**
 * ZARVA team logins. Only an admin can add an admin; there is no sign-up. The new login's starting
 * password and authenticator key are shown once, to hand over privately.
 */
export function AdminTeam() {
  const [me, setMe] = useState<AdminAccount | null>(null);
  const [team, setTeam] = useState<AdminAccount[]>([]);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<AdminCreated | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, t] = await Promise.all([adminApi.adminMe(), adminApi.adminTeam()]);
    setMe(m.admin);
    setTeam(t.admins);
  }, []);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setMsg(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

      <div className="card stack">
        <strong>ZARVA team</strong>
        {team.map((a) => (
          <div key={a.id} className="sum-row" style={{ alignItems: "center" }}>
            <span>
              <strong>{a.name}</strong> <span className="muted">@{a.username}{a.id === me?.id ? " (you)" : ""}</span>
              <div className="muted" style={{ fontSize: 13 }}>Last sign-in {day(a.lastLoginAt)}{a.hasAuthenticator ? "" : " · no authenticator (local demo only)"}</div>
            </span>
            {a.id !== me?.id && (
              a.status === "active"
                ? <button className="btn btn-ghost" onClick={() => window.confirm(`Disable ${a.name}? They are signed out at once.`) && void run(() => adminApi.adminSetStatus(a.id, "disabled"))}>Disable</button>
                : <button className="btn btn-ghost" onClick={() => void run(() => adminApi.adminSetStatus(a.id, "active"))}>Enable</button>
            )}
          </div>
        ))}
      </div>

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { setCreated(await adminApi.adminCreate(username, name)); setUsername(""); setName(""); }); }}>
        <strong>Add a team member</strong>
        <div className="row">
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="riya.ops" autoCapitalize="none" required minLength={3} /></label>
          <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        </div>
        <button className="btn" style={{ alignSelf: "flex-start" }}>Create login</button>
      </form>

      {created && (
        <div className="card stack created-login" role="status">
          <strong>Login for {created.admin.name}. Shown only once: give it to them privately.</strong>
          <div className="sum-row"><span className="muted">Username</span><code>{created.admin.username}</code></div>
          <div className="sum-row"><span className="muted">Starting password</span><code>{created.password}</code></div>
          <div className="sum-row"><span className="muted">Authenticator key</span><code style={{ wordBreak: "break-all" }}>{created.authenticatorKey}</code></div>
          <span className="muted">They open Google Authenticator → + → “Enter a setup key”, type the key (time based), then sign in at /admin/login and change the password here.</span>
          <button className="btn btn-ghost" onClick={() => setCreated(null)}>I&apos;ve handed it over</button>
        </div>
      )}

      <form className="card stack" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => { await adminApi.adminChangePassword(pw.current, pw.next); setPw({ current: "", next: "" }); setMsg("Password changed. Your other sign-ins were signed out."); });
      }}>
        <strong>Change my password</strong>
        <div className="row">
          <label>Current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></label>
          <label>New password (10+ characters)<input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={10} /></label>
        </div>
        <button className="btn" style={{ alignSelf: "flex-start" }}>Change password</button>
      </form>
    </div>
  );
}
