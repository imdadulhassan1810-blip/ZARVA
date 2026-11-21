"use client";
import { useCallback, useEffect, useState } from "react";
import type { ApiClient, AuthProviders, LoginResult } from "@zarva/core";
import { CodeForm } from "./CodeForm";
import { GoogleButton } from "./GoogleButton";

type Method = "phone" | "email";

/**
 * The one-time-code sign-in box used by the customer and partner sign-in pages. Which app you get
 * is decided by the client passed in: the customer client opens a customer session, the partner
 * client a partner session, and neither opens the other app.
 */
export function SignIn({
  client,
  title,
  subtitle,
  phoneOnly = false,
  onSignedIn,
  children,
}: {
  client: ApiClient;
  title: string;
  subtitle: string;
  /** Partners are identified by their mobile number, so the partner app only offers OTP. */
  phoneOnly?: boolean;
  onSignedIn: (r: LoginResult) => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [method, setMethod] = useState<Method>("phone");
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    if (phoneOnly) return;
    client.providers().then(setProviders).catch(() => setProviders({ phone: true, email: true, google: { mode: "off", clientId: null } }));
  }, [client, phoneOnly]);

  const onGoogle = useCallback(async (idToken: string) => onSignedIn(await client.googleLogin(idToken)), [client, onSignedIn]);

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
          <CodeForm key="phone" kind="phone" onSend={(p) => client.requestOtp(p)} onVerify={async (p, c) => onSignedIn(await client.verifyOtp(p, c))} />
        ) : (
          <CodeForm key="email" kind="email" onSend={(e) => client.requestEmailCode(e)} onVerify={async (e, c) => onSignedIn(await client.verifyEmailCode(e, c))} />
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>No password needed. We send a one-time code each time you sign in.</p>
      {children && <div className="signin-switch">{children}</div>}
    </div>
  );
}
