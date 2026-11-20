import type { Address, AuthTokens, PublicUser } from "./api-types";
import type { ModuleStatus } from "./modules";
import type { AddressInput, ProfileUpdate } from "./schemas";

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): void;
}

/** Tiny typed client shared by web and mobile. Refreshes the access token once on 401. */
export function createApiClient(baseUrl: string, store: TokenStore, fetchImpl: typeof fetch = fetch) {
  async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const tokens = store.get();
    if (auth && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    if (!res.ok) throw new ApiRequestError(res.status, json.error?.code ?? "unknown", json.error?.message ?? res.statusText);
    return json as T;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await raw<T>(method, path, body);
    } catch (e) {
      const tokens = store.get();
      if (e instanceof ApiRequestError && e.status === 401 && tokens) {
        try {
          const fresh = await raw<AuthTokens>("POST", "/v1/auth/refresh", { refreshToken: tokens.refreshToken }, false);
          store.set(fresh);
        } catch {
          store.set(null);
          throw e;
        }
        return raw<T>(method, path, body);
      }
      throw e;
    }
  }

  return {
    requestOtp: (phone: string) => raw<{ sent: true; retryAfter: number }>("POST", "/v1/auth/otp/request", { phone }, false),
    verifyOtp: async (phone: string, code: string) => {
      const r = await raw<AuthTokens & { user: PublicUser; isNewUser: boolean }>("POST", "/v1/auth/otp/verify", { phone, code }, false);
      store.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
      return r;
    },
    logout: async () => {
      const t = store.get();
      if (t) await raw("POST", "/v1/auth/logout", { refreshToken: t.refreshToken }, false).catch(() => undefined);
      store.set(null);
    },
    me: () => call<{ user: PublicUser }>("GET", "/v1/me"),
    updateMe: (patch: ProfileUpdate) => call<{ user: PublicUser }>("PATCH", "/v1/me", patch),
    listAddresses: () => call<{ addresses: Address[] }>("GET", "/v1/me/addresses"),
    addAddress: (a: AddressInput) => call<{ address: Address }>("POST", "/v1/me/addresses", a),
    updateAddress: (id: string, a: Partial<AddressInput>) => call<{ address: Address }>("PATCH", `/v1/me/addresses/${id}`, a),
    deleteAddress: (id: string) => call<void>("DELETE", `/v1/me/addresses/${id}`),
    modules: () => raw<{ modules: ModuleStatus[] }>("GET", "/v1/modules", undefined, false),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
