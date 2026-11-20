"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AuthProviders, LoginResult } from "@zarva/core";
import { CodeForm } from "../../components/CodeForm";
import { GoogleButton } from "../../components/GoogleButton";
import { api } from "../../lib/api";

type Method = "phone" | "email";

function safeNext(): string | null {
  // Only same-site paths, so ?next= can't bounce people to another website.
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default function Login() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("phone");
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    api.providers().then(setProviders).catch(() => setProviders({ phone: true, email: true, google: { mode: "off", clientId: null } }));
  }, []);

  const done = useCallback(
    (r: LoginResult) => {
      const next = safeNext();
      // New or incomplete accounts go to the account page to add a name and a phone (needed for bookings).
      const incomplete = r.isNewUser || !r.user.name || !r.user.phone;
      router.replace(incomplete ? `/account?welcome=1${next ? `&next=${encodeURIComponent(next)}` : ""}` : (next ?? "/"));
    },
    [router],
  );

  const onGoogle = useCallback(async (idToken: string) => done(await api.googleLogin(idToken)), [done]);

  return (
    <div style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>Sign in or sign up</h1>
      <p className="muted">One account for every ZARVA service.</p>

      <div className="card stack">
        {providers && <GoogleButton google={providers.google} onToken={onGoogle} />}
        {providers?.google.mode !== "off" && <div className="divider"><span>or</span></div>}

        <div className="segmented" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={method === "phone"} className={method === "phone" ? "on" : ""} onClick={() => setMethod("phone")}>Mobile</button>
          <button type="button" role="tab" aria-selected={method === "email"} className={method === "email" ? "on" : ""} onClick={() => setMethod("email")}>Email</button>
        </div>

        {method === "phone" ? (
          <CodeForm key="phone" kind="phone" onSend={(p) => api.requestOtp(p)} onVerify={async (p, c) => done(await api.verifyOtp(p, c))} />
        ) : (
          <CodeForm key="email" kind="email" onSend={(e) => api.requestEmailCode(e)} onVerify={async (e, c) => done(await api.verifyEmailCode(e, c))} />
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>No password needed. We send a one-time code each time you sign in.</p>
    </div>
  );
}
