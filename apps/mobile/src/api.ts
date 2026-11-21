import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createApiClient, type AuthTokens, type TokenStore } from "@zarva/core";

export type AppMode = "customer" | "partner";

/**
 * Tokens live in the iOS Keychain / Android Keystore; an in-memory copy keeps reads synchronous.
 * The customer app and the partner app keep separate tokens: a partner sign-in never opens the
 * customer app, and the server refuses the other app's screens.
 */
/** The browser preview (expo start --web) has no Keychain, so it keeps tokens in localStorage. Phones never use this. */
const web = Platform.OS === "web";
const kv = {
  get: (k: string) => (web ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (web ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (web ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

function secureStore(key: string) {
  let cache: AuthTokens | null = null;
  const store: TokenStore = {
    get: () => cache,
    set(t) {
      cache = t;
      void (t ? kv.set(key, JSON.stringify(t)) : kv.del(key));
    },
  };
  const load = async () => {
    const raw = await kv.get(key);
    cache = raw ? (JSON.parse(raw) as AuthTokens) : null;
    return cache !== null;
  };
  return { store, load };
}
const customer = secureStore("zarva.tokens");
const partner = secureStore("zarva.partner.tokens");

/** Loads the saved sign-in for this app; true if there is one. */
export function loadTokens(mode: AppMode = "customer"): Promise<boolean> {
  return (mode === "partner" ? partner : customer).load();
}

/**
 * In development the phone loads the app from your computer (Expo's hostUri, e.g. "192.168.1.5:8081"),
 * so the API is on that same computer at port 4000. A store build gets the live address from API_URL (app.config.js).
 */
function resolveApiUrl(): string {
  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (configured) return configured;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}
const apiUrl = resolveApiUrl();
/** Customer app. */
export const api = createApiClient(apiUrl, customer.store, undefined, "customer");
/** Partner app (ZARVA Partner). */
export const partnerApi = createApiClient(apiUrl, partner.store, undefined, "partner");

/** Which app this build is: fixed in store builds (APP_VARIANT), chosen at launch in development. */
const configuredMode = (Constants.expoConfig?.extra as { appMode?: unknown } | undefined)?.appMode;
export const buildMode: AppMode | null = configuredMode === "customer" || configuredMode === "partner" ? configuredMode : null;
