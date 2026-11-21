"use client";
import { createApiClient, type AuthTokens, type TokenStore } from "@zarva/core";

/**
 * Each app keeps its own tokens in this browser, so being signed in to the partner app never signs
 * you in to the customer app (or the reverse), and signing out of one leaves the others alone.
 */
const KEYS = { customer: "zarva.tokens", partner: "zarva.partner.tokens", admin: "zarva.admin.tokens" } as const;
export type App = keyof typeof KEYS;

/**
 * Tokens in localStorage keep the foundation simple. Before launch, move the refresh token
 * to an httpOnly cookie set by a Next.js route handler so page scripts cannot read it.
 */
function storeFor(key: string): TokenStore {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as AuthTokens) : null;
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

/** Customer app (booking, account). */
export const api = createApiClient(base, stores.customer, undefined, "customer");
/** Partner app (/pro): jobs, earnings, KYC. */
export const partnerApi = createApiClient(base, stores.partner, undefined, "partner");
/** Admin app (/admin): ZARVA team logins. */
export const adminApi = createApiClient(base, stores.admin, undefined, "admin");

export const isSignedIn = (app: App = "customer") => stores[app].get() !== null;
