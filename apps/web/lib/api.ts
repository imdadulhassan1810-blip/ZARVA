"use client";
import { createApiClient, type AuthTokens, type TokenStore } from "@zarva/core";

const KEY = "zarva.tokens";

/**
 * Tokens in localStorage keep the foundation simple. Before launch, move the refresh token
 * to an httpOnly cookie set by a Next.js route handler so page scripts cannot read it.
 */
const store: TokenStore = {
  get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      return null;
    }
  },
  set(t) {
    try {
      if (t) localStorage.setItem(KEY, JSON.stringify(t));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage blocked */
    }
  },
};

export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", store);
export const isSignedIn = () => store.get() !== null;
