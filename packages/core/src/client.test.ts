import { describe, expect, it, vi } from "vitest";
import { createApiClient, REFRESH_IN_COOKIE, type SessionKeeper, type TokenStore } from "./client";
import type { AuthTokens } from "./api-types";

function memoryStore(): TokenStore & { value: AuthTokens | null } {
  return { value: null, get() { return this.value; }, set(t) { this.value = t; } };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("website sessions: refresh token kept by the website's server, not in page storage", () => {
  it("signs in, refreshes and signs out through the keeper, never storing the refresh token", async () => {
    const store = memoryStore();
    const keeper: SessionKeeper = {
      login: vi.fn(async () => ({ accessToken: "a1", expiresIn: 900, user: { id: "u" }, isNewUser: false })) as SessionKeeper["login"],
      refresh: vi.fn(async () => ({ accessToken: "a2", expiresIn: 900 })),
      logout: vi.fn(async () => undefined),
    };
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      seen.push(`${String(url)} ${auth}`);
      return auth === "Bearer a1" ? json(401, { error: { code: "unauthorized", message: "expired" } }) : json(200, { user: { id: "u" } });
    }) as unknown as typeof fetch;
    const api = createApiClient("https://api.test", store, fetchImpl, "customer", keeper);

    await api.verifyOtp("+919876543210", "123456");
    expect(keeper.login).toHaveBeenCalledWith("/v1/auth/otp/verify", { phone: "+919876543210", code: "123456", portal: "customer" });
    expect(store.value).toEqual({ accessToken: "a1", refreshToken: REFRESH_IN_COOKIE, expiresIn: 900 });

    await api.me(); // 401 with a1, refresh via keeper, retry with a2
    expect(keeper.refresh).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["https://api.test/v1/me Bearer a1", "https://api.test/v1/me Bearer a2"]);
    expect(store.value?.refreshToken).toBe(REFRESH_IN_COOKIE);

    await api.logout();
    expect(keeper.logout).toHaveBeenCalled();
    expect(store.value).toBeNull();
  });
});

describe("token refresh", () => {
  it("parallel requests with an expired token share one refresh (a second one would end the session)", async () => {
    const store = memoryStore();
    store.set({ accessToken: "old", refreshToken: "r1", expiresIn: 900 });
    let refreshes = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/v1/auth/refresh")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: "new", refreshToken: "r2", expiresIn: 900 });
      }
      const auth = (init?.headers as Record<string, string>)?.authorization;
      return auth === "Bearer new" ? json(200, { ok: true }) : json(401, { error: { code: "unauthorized", message: "expired" } });
    }) as unknown as typeof fetch;
    const api = createApiClient("https://api.test", store, fetchImpl);
    await Promise.all([api.me(), api.listAddresses(), api.home.bookings()]);
    expect(refreshes).toBe(1);
    expect(store.value).toEqual({ accessToken: "new", refreshToken: "r2", expiresIn: 900 });
  });
});
