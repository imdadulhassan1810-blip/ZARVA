"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ApiClient, AuthProviders, LoginResult } from "@zarva/core";
import { AppleButton } from "./AppleButton";
import { BrandIntro } from "./BrandIntro";
import { CodeForm } from "./CodeForm";
import { GoogleButton } from "./GoogleButton";

type View = "options" | "email" | "phone" | "signup";

const OFF: AuthProviders = { phone: true, email: true, google: { mode: "off", clientId: null }, apple: { mode: "off", serviceId: null } };

/**
 * The customer sign-in screen: the animated logo, then the four ways in (Google, Email, Apple,
 * Phone, in that order), then the two sign-up buttons. Customer sign-up stays here; partner
 * sign-up goes to the separate partner app (/partner/login), so the two never mix. ZARVA team
 * members sign in at /admin/login, which is deliberately not linked from here.
 */
export function LaunchSignIn({ client, onSignedIn }: { client: ApiClient; onSignedIn: (r: LoginResult) => void | Promise<void> }) {
  const [view, setView] = useState<View>("options");
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    client.providers().then(setProviders).catch(() => setProviders(OFF));
  }, [client]);

  const onGoogle = useCallback(async (idToken: string) => onSignedIn(await client.googleLogin(idToken)), [client, onSignedIn]);
  const onApple = useCallback(async (token: string, name?: string) => onSignedIn(await client.appleLogin(token, name)), [client, onSignedIn]);
  const phoneForm = (
    <CodeForm key="phone" kind="phone" onSend={(p) => client.requestOtp(p)} onVerify={async (p, c) => onSignedIn(await client.verifyOtp(p, c))} />
  );

  return (
    <section className="launch">
      <div className="launch-glow" aria-hidden="true" />
      <BrandIntro />

      <div className="launch-reveal"><div className="launch-actions">
        {view === "options" && (
          <>
            <div className="stack">
              {providers && <GoogleButton google={providers.google} onToken={onGoogle} />}
              <button type="button" className="btn launch-btn" onClick={() => setView("email")}>
                <Icon d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zm1.8.3 7.2 5.4 7.2-5.4" /> Continue with Email
              </button>
              {providers && <AppleButton apple={providers.apple} onToken={onApple} />}
              <button type="button" className="btn launch-btn" onClick={() => setView("phone")}>
                <Icon d="M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 18.5h3" /> Continue with Phone
              </button>
            </div>

            <div className="launch-divider"><span>New to ZARVA?</span></div>
            <div className="launch-signup">
              <button type="button" className="btn" onClick={() => setView("signup")}>Customer sign up</button>
              <Link className="btn btn-partner" href="/partner/login">Partner sign up</Link>
            </div>
            <p className="launch-fine">No password needed. By continuing you agree to ZARVA&apos;s terms and privacy policy.</p>
          </>
        )}

        {view !== "options" && (
          <div className="launch-panel stack">
            <button type="button" className="launch-back" onClick={() => setView("options")}>← All sign-in options</button>
            {view === "email" && (
              <>
                <h2 className="launch-h">Continue with Email</h2>
                <CodeForm key="email" kind="email" onSend={(e) => client.requestEmailCode(e)} onVerify={async (e, c) => onSignedIn(await client.verifyEmailCode(e, c))} />
              </>
            )}
            {view === "phone" && (<><h2 className="launch-h">Continue with Phone</h2>{phoneForm}</>)}
            {view === "signup" && (
              <>
                <h2 className="launch-h">Create your customer account</h2>
                <p className="muted" style={{ margin: 0 }}>Start with your mobile number: bookings need it so your professional can reach you. You can add email, Google or Apple later.</p>
                {phoneForm}
              </>
            )}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>We send a one-time code. No password needed.</p>
          </div>
        )}
      </div></div>
    </section>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
