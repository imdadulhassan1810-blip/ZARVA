import { afterEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, stepOf, totpAt, verifyTotp } from "../src/admin/totp";
import { loadConfig } from "../src/lib/config";
import { setupTestApp } from "./helpers";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890", the RFC 6238 test key
const ADMIN = "9999900000";
const REAL = { OTP_PROVIDER: "msg91", EMAIL_PROVIDER: "resend", PAYMENT_PROVIDER: "razorpay", JWT_SECRET: "a-real-secret-a-real-secret-a-real-secret" };

describe("authenticator codes (TOTP)", () => {
  it("matches the RFC 6238 test vector and base32 round-trips", () => {
    expect(base32Encode(Buffer.from("12345678901234567890"))).toBe(SECRET);
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
    expect(totpAt(SECRET, stepOf(new Date(59_000)))).toBe("287082");
    expect(totpAt(SECRET, stepOf(new Date(1111111109_000)))).toBe("081804");
  });
  it("accepts one step of clock drift, rejects older codes and junk", () => {
    const now = new Date(1111111109_000);
    const step = stepOf(now);
    expect(verifyTotp(SECRET, totpAt(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpAt(SECRET, step - 3), now)).toBeNull();
    expect(verifyTotp(SECRET, "12ab56", now)).toBeNull();
  });
});

describe("config: dev shortcuts only on a developer's machine", () => {
  it("local dev gets the demo admin; tests and real deployments don't", () => {
    expect(loadConfig({ NODE_ENV: "development" })).toMatchObject({ devShortcuts: true, adminPhones: ["+919999900000"] });
    expect(loadConfig({ NODE_ENV: "test" }).adminPhones).toEqual([]);
  });

  it("forgetting NODE_ENV=production on a real server still turns every shortcut off", () => {
    const c = loadConfig({ NODE_ENV: "development", ...REAL });
    expect(c.devShortcuts).toBe(false);
    expect(c.adminPhones).toEqual([]); // no 99999 00000 admin
  });

  it("refuses to start a real deployment with fake payments, a dev secret or admins without a second factor", () => {
    expect(() => loadConfig({ NODE_ENV: "development", ...REAL, PAYMENT_PROVIDER: "mock" })).toThrow(/razorpay/);
    expect(() => loadConfig({ NODE_ENV: "development", ...REAL, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...REAL, ADMIN_PHONES: "9876543210" })).toThrow(/authenticator secret/);
    expect(loadConfig({ ...REAL, ADMIN_PHONES: "9876543210", ADMIN_TOTP_SECRETS: `9876543210:${SECRET}` }).adminTotp.get("+919876543210")).toBe(SECRET);
  });

  it("rejects typos in admin numbers instead of silently ignoring them", () => {
    expect(() => loadConfig({ ADMIN_PHONES: "98765" })).toThrow(/ADMIN_PHONES/);
    expect(() => loadConfig({ ADMIN_PHONES: "9876543210", ADMIN_TOTP_SECRETS: "9876543210:not-base32!" })).toThrow(/ADMIN_TOTP_SECRETS/);
  });
});

describe("admin access on a real deployment", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const clock = { t: 1_800_000_000_000 };
  afterEach(async () => { await t.close(); });
  const start = async () => {
    t = await setupTestApp({ ...REAL, ADMIN_PHONES: ADMIN, ADMIN_TOTP_SECRETS: `${ADMIN}:${SECRET}` }, { now: () => new Date(clock.t) });
  };
  const get = (url: string, headers?: Record<string, string>) => t.app.inject({ method: "GET", url, headers });
  const unlock = (headers: Record<string, string>, code: string) => t.app.inject({ method: "POST", url: "/v1/admin/unlock", headers, payload: { code } });
  const codeNow = () => totpAt(SECRET, stepOf(new Date(clock.t)));

  it("non-admins are refused; the admin number alone is not enough without the authenticator code", async () => {
    await start();
    const user = await t.login("9876543210");
    expect((await get("/v1/m/home/admin/bookings")).statusCode).toBe(401);
    expect((await get("/v1/m/home/admin/bookings", user.headers)).json().error.code).toBe("forbidden");
    expect((await get("/v1/admin/status", user.headers)).json()).toEqual({ admin: false, needsCode: false, unlocked: false });

    const admin = await t.login(ADMIN);
    expect((await get("/v1/m/home/admin/bookings", admin.headers)).json().error.code).toBe("admin_code_required");
    expect((await get("/v1/admin/status", admin.headers)).json()).toEqual({ admin: true, needsCode: true, unlocked: false });

    expect((await unlock(admin.headers, "000000")).json().error.code).toBe("wrong_admin_code");
    expect((await unlock(admin.headers, codeNow())).statusCode).toBe(200);
    expect((await get("/v1/m/home/admin/bookings", admin.headers)).statusCode).toBe(200);
    // A non-admin can't unlock anything even with a valid code.
    expect((await unlock(user.headers, codeNow())).statusCode).toBe(403);
  });

  it("a code works once, the unlock expires after 8 hours, and logging out ends it", async () => {
    await start();
    const admin = await t.login(ADMIN);
    const code = codeNow();
    expect((await unlock(admin.headers, code)).statusCode).toBe(200);
    expect((await unlock(admin.headers, code)).json().error.code).toBe("wrong_admin_code");

    clock.t += 8 * 3600_000 + 1000;
    expect((await get("/v1/m/home/admin/bookings", admin.headers)).json().error.code).toBe("admin_code_required");
    expect((await unlock(admin.headers, codeNow())).statusCode).toBe(200);

    await t.app.inject({ method: "POST", url: "/v1/auth/logout", payload: { refreshToken: admin.refreshToken } });
    expect((await get("/v1/m/home/admin/bookings", admin.headers)).statusCode).toBe(401);
  });

  it("locks out for 15 minutes after 5 wrong codes", async () => {
    await start();
    const admin = await t.login(ADMIN);
    for (let i = 0; i < 5; i++) expect((await unlock(admin.headers, "111111")).statusCode).toBe(400);
    expect((await unlock(admin.headers, codeNow())).statusCode).toBe(429);
    clock.t += 16 * 60_000;
    expect((await unlock(admin.headers, codeNow())).statusCode).toBe(200);
  });

  it("demo shortcuts are switched off: no instant mock payments, no demo Google sign-in", async () => {
    await start();
    expect((await t.app.inject({ method: "POST", url: "/v1/payments/mock/mock_order_x/succeed" })).statusCode).toBe(404);
    const g = await t.app.inject({ method: "POST", url: "/v1/auth/google", payload: { idToken: "mock:attacker@gmail.com:Evil" } });
    expect(g.statusCode).toBeGreaterThanOrEqual(400);
  });
});
