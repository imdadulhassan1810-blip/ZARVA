import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createApiClient, type AuthTokens, type TokenStore } from "@zarva/core";

const KEY = "zarva.tokens";
let cache: AuthTokens | null = null;

/** Tokens live in the iOS Keychain / Android Keystore; an in-memory copy keeps reads synchronous. */
const store: TokenStore = {
  get: () => cache,
  set(t) {
    cache = t;
    void (t ? SecureStore.setItemAsync(KEY, JSON.stringify(t)) : SecureStore.deleteItemAsync(KEY));
  },
};

export async function loadTokens(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(KEY);
  cache = raw ? (JSON.parse(raw) as AuthTokens) : null;
  return cache !== null;
}

const apiUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "http://localhost:4000";
export const api = createApiClient(apiUrl, store);
