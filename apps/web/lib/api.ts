"use client";
import { ApiRequestError, createApiClient, REFRESH_IN_COOKIE, type AuthTokens, type SessionKeeper, type TokenStore } from "@zarva/core";

/**
 * Each app keeps its own tokens in this browser, so being signed in to the partner app never signs
 * you in to the customer app (or the reverse), and signing out of one leaves the others alone.
 */
const KEYS = { customer: "zarva.tokens", partner: "zarva.partner.tokens", admin: "zarva.admin.tokens" } as const;
export type App = keyof typeof KEYS;

/**
 * Only the short-lived access token (15 minutes) is kept in localStorage. The 60-day refresh token
 * stays in an httpOnly cookie held by this website's own server (app/session/...), so a script
 * injected into a page can't take over an account for long.
 */
function storeFor(key: string): TokenStore {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        const t = raw ? (JSON.parse(raw) as AuthTokens) : null;
        // A sign-in saved by an older version kept the refresh token here: drop it (sign in again once).
        if (t && t.refreshToken !== REFRESH_IN_COOKIE) {
          localStorage.removeItem(key);
          return null;
        }
        return t;
      } catch {
        return null;
      }
    },
    set(t) {
      try {
        if (t) localStorage.setItem(key, JSON.stringify(t));
        else localStorage.removeItem(key);
      } catch {
        /* storage blocked */
      }
    },
  };
}

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const stores = { customer: storeFor(KEYS.customer), partner: storeFor(KEYS.partner), admin: storeFor(KEYS.admin) };

/** Sign-in, refresh and sign-out go through this website's server, which keeps the refresh token in a cookie. */
function keeperFor(app: App): SessionKeeper {
  async function post<T>(action: string, body?: unknown): Promise<T> {
    const res = await fetch(`/session/${app}/${action}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    if (!res.ok) throw new ApiRequestError(res.status, json.error?.code ?? "unknown", json.error?.message ?? res.statusText);
    return json as T;
  }
  return {
    login: (path, body) => post("login", { path, body }),
    refresh: () => post("refresh"),
    logout: () => post("logout"),
  };
}

/** Customer app (booking, account). */
export const api = createApiClient(base, stores.customer, undefined, "customer", keeperFor("customer"));
/** Partner app (/pro): jobs, earnings, KYC. */
export const partnerApi = createApiClient(base, stores.partner, undefined, "partner", keeperFor("partner"));
/** Admin app (/admin): ZARVA team logins. */
export const adminApi = createApiClient(base, stores.admin, undefined, "admin", keeperFor("admin"));

export const isSignedIn = (app: App = "customer") => stores[app].get() !== null;
