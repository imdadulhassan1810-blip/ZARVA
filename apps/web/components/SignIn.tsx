"use client";
import { useCallback, useEffect, useState } from "react";
import type { AuthProviders, LoginResult } from "@zarva/core";
import { api } from "../lib/api";
import { clearRoles } from "../lib/roles";
import { CodeForm } from "./CodeForm";
import { GoogleButton } from "./GoogleButton";

type Method = "phone" | "email";

/**
 * The sign-in box shared by the customer, partner and admin sign-in pages. All three create or
 * open the same ZARVA account; only the methods offered and where you land afterwards differ.
 */
export function SignIn({
  title,
  subtitle,
  phoneOnly = false,
  onSignedIn,
  children,
}: {
  title: string;
  subtitle: string;
  /** Partners and admins are identified by their verified mobile number, so they only get OTP. */
  phoneOnly?: boolean;
  onSignedIn: (r: LoginResult) => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [method, setMethod] = useState<Method>("phone");
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    if (phoneOnly) return;
    api.providers().then(setProviders).catch(() => setProviders({ phone: true, email: true, google: { mode: "off", clientId: null } }));
  }, [phoneOnly]);

  const done = useCallback(async (r: LoginResult) => {
    clearRoles();
    await onSignedIn(r);
  }, [onSignedIn]);

  const onGoogle = useCallback(async (idToken: string) => done(await api.googleLogin(idToken)), [done]);

  return (
    <div style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>

      <div className="card stack">
        {!phoneOnly && providers && <GoogleButton google={providers.google} onToken={onGoogle} />}
        {!phoneOnly && providers && providers.google.mode !== "off" && <div className="divider"><span>or</span></div>}

        {!phoneOnly && (
          <div className="segmented" role="tablist" aria-label="Sign-in method">
            <button type="button" role="tab" aria-selected={method === "phone"} className={method === "phone" ? "on" : ""} onClick={() => setMethod("phone")}>Mobile</button>
            <button type="button" role="tab" aria-selected={method === "email"} className={method === "email" ? "on" : ""} onClick={() => setMethod("email")}>Email</button>
          </div>
        )}

        {method === "phone" || phoneOnly ? (
          <CodeForm key="phone" kind="phone" onSend={(p) => api.requestOtp(p)} onVerify={async (p, c) => done(await api.verifyOtp(p, c))} />
        ) : (
          <CodeForm key="email" kind="email" onSend={(e) => api.requestEmailCode(e)} onVerify={async (e, c) => done(await api.verifyEmailCode(e, c))} />
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>No password needed. We send a one-time code each time you sign in.</p>
      {children && <div className="signin-switch">{children}</div>}
    </div>
  );
}
