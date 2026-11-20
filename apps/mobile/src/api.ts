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

/**
 * In development the phone loads the app from your computer (Expo's hostUri, e.g. "192.168.1.5:8081"),
 * so the API is on that same computer at port 4000. Set extra.apiUrl in app.json to override.
 */
function resolveApiUrl(): string {
  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (configured) return configured;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}
const apiUrl = resolveApiUrl();
export const api = createApiClient(apiUrl, store);
