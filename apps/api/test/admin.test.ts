import { afterEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, stepOf, totpAt, verifyTotp } from "../src/admin/totp";
import { hashPassword, verifyPassword } from "../src/admin/passwords";
import { loadConfig } from "../src/lib/config";
import { setupTestApp } from "./helpers";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890", the RFC 6238 test key
const REAL = {
  OTP_PROVIDER: "msg91", EMAIL_PROVIDER: "resend", PAYMENT_PROVIDER: "razorpay", JWT_SECRET: "a-real-secret-a-real-secret-a-real-secret",
  SMS_PROVIDER: "off", WHATSAPP_PROVIDER: "off", KYC_ENCRYPTION_KEY: "a-real-kyc-key-a-real-kyc-key-a-real-kyc-key",
};

describe("authenticator codes (TOTP) and passwords", () => {
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
  it("hashes passwords with a salt and checks them", async () => {
    const a = await hashPassword("correct horse battery");
    expect(a).not.toBe(await hashPassword("correct horse battery"));
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });
});

describe("config: dev shortcuts only on a developer's machine", () => {
  it("forgetting NODE_ENV=production on a real server still turns every shortcut off", () => {
    expect(loadConfig({ NODE_ENV: "development" }).devShortcuts).toBe(true);
    expect(loadConfig({ NODE_ENV: "development", ...REAL }).devShortcuts).toBe(false);
  });
  it("refuses to start a real deployment with fake payments or a dev secret", () => {
    expect(() => loadConfig({ NODE_ENV: "development", ...REAL, PAYMENT_PROVIDER: "mock" })).toThrow(/razorpay/);
    expect(() => loadConfig({ NODE_ENV: "development", ...REAL, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
  });
  it("on a live server, refuses to start until the website address is allowed to call the API", () => {
    const prod = { ...REAL, NODE_ENV: "production", DATABASE_URL: "postgres://db/zarva", PUBLIC_WEB_URL: "https://zarva.in" };
    expect(() => loadConfig(prod)).toThrow(/CORS_ORIGINS/);
    expect(() => loadConfig({ ...prod, CORS_ORIGINS: "http://localhost:3000" })).toThrow(/CORS_ORIGINS/);
    expect(loadConfig({ ...prod, CORS_ORIGINS: "https://zarva.in,https://www.zarva.in" }).devShortcuts).toBe(false);
  });
});

describe("admin app: ZARVA-issued logins", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const clock = { t: 1_800_000_000_000 };
  afterEach(async () => { await t.close(); });
  const start = async () => {
    t = await setupTestApp(REAL, { now: () => new Date(clock.t) });
  };
  const post = (url: string, payload: unknown, headers?: Record<string, string>) => t.app.inject({ method: "POST", url, payload: payload as object, headers });
  const get = (url: string, headers?: Record<string, string>) => t.app.inject({ method: "GET", url, headers });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  /** The code shown in the authenticator app right now for this admin's key. */
  const codeFor = (key: string) => totpAt(key, stepOf(new Date(clock.t)));
  const nextStep = () => { clock.t += 30_000; };

  async function firstAdmin() {
    return t.app.services.admins.create(null, { username: "imdad", name: "Imdad" });
  }

  it("needs username + password + authenticator code; a phone sign-in is never an admin", async () => {
    await start();
    const a = await firstAdmin();
    expect(a.password).toHaveLength(16);
    expect(a.authenticatorKey).toMatch(/^[A-Z2-7]{32}$/);

    expect((await post("/v1/admin/auth/login", { username: "imdad", password: "nope", code: codeFor(a.authenticatorKey) })).json().error.code).toBe("wrong_credentials");
    expect((await post("/v1/admin/auth/login", { username: "nobody", password: a.password })).json().error.code).toBe("wrong_credentials");
    // Right password, no code: ask for the code (and only then).
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password })).json().error.code).toBe("admin_code_required");
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: "000000" })).json().error.code).toBe("wrong_credentials");

    const ok = await post("/v1/admin/auth/login", { username: "IMDAD", password: a.password, code: codeFor(a.authenticatorKey) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().admin).toMatchObject({ username: "imdad", hasAuthenticator: true });
    expect((await get("/v1/m/home/admin/bookings", bearer(ok.json().accessToken))).statusCode).toBe(200);
    // The same code can't be used twice.
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).statusCode).toBe(401);

    // Customers and partners are refused by admin screens, whoever they are.
    const cust = await t.login("9876543210");
    expect((await get("/v1/m/home/admin/bookings", cust.headers)).json().error.code).toBe("wrong_portal");
    expect((await get("/v1/m/home/admin/bookings")).statusCode).toBe(401);
    // And admin tokens open nothing outside the admin app.
    expect((await get("/v1/me", bearer(ok.json().accessToken))).json().error.code).toBe("wrong_portal");
    expect((await get("/v1/m/home/pro/jobs", bearer(ok.json().accessToken))).json().error.code).toBe("wrong_portal");
  });

  it("locks the account for 15 minutes after 5 wrong attempts", async () => {
    await start();
    const a = await firstAdmin();
    for (let i = 0; i < 5; i++) await post("/v1/admin/auth/login", { username: "imdad", password: "wrong-password" });
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).statusCode).toBe(429);
    clock.t += 16 * 60_000;
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).statusCode).toBe(200);
  });

  it("only admins add admins; disabling one ends their sessions; you can't disable yourself", async () => {
    await start();
    const a = await firstAdmin();
    const me = (await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).json();
    const H = bearer(me.accessToken);

    const created = await post("/v1/admin/team", { username: "riya.ops", name: "Riya Sen" }, H);
    expect(created.statusCode).toBe(201);
    const riya = created.json();
    expect(riya.password).toBeTruthy();
    expect(riya.authenticatorLink).toContain("otpauth://totp/");
    expect((await post("/v1/admin/team", { username: "riya.ops", name: "Again" }, H)).json().error.code).toBe("username_taken");
    const cust = await t.login("9876543210");
    expect((await post("/v1/admin/team", { username: "sneaky", name: "Sneaky" }, cust.headers)).json().error.code).toBe("wrong_portal");

    nextStep();
    const r = (await post("/v1/admin/auth/login", { username: "riya.ops", password: riya.password, code: codeFor(riya.authenticatorKey) })).json();
    expect((await get("/v1/admin/me", bearer(r.accessToken))).json().admin.name).toBe("Riya Sen");

    expect((await t.app.inject({ method: "PATCH", url: `/v1/admin/team/${me.admin.id}`, headers: H, payload: { status: "disabled" } })).json().error.code).toBe("cannot_disable_self");
    expect((await t.app.inject({ method: "PATCH", url: `/v1/admin/team/${riya.admin.id}`, headers: H, payload: { status: "disabled" } })).json().admin.status).toBe("disabled");
    expect((await get("/v1/admin/me", bearer(r.accessToken))).statusCode).toBe(401);
    expect((await post("/v1/admin/auth/refresh", { refreshToken: r.refreshToken })).statusCode).toBe(401);
    nextStep();
    expect((await post("/v1/admin/auth/login", { username: "riya.ops", password: riya.password, code: codeFor(riya.authenticatorKey) })).statusCode).toBe(403);
  });

  it("changing the password signs out other sessions; logout ends the session", async () => {
    await start();
    const a = await firstAdmin();
    const s1 = (await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).json();
    nextStep();
    const s2 = (await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).json();
    expect((await post("/v1/admin/me/password", { currentPassword: "wrong", newPassword: "a-new-long-password" }, bearer(s1.accessToken))).json().error.code).toBe("wrong_password");
    expect((await post("/v1/admin/me/password", { currentPassword: a.password, newPassword: "a-new-long-password" }, bearer(s1.accessToken))).statusCode).toBe(204);
    expect((await get("/v1/admin/me", bearer(s2.accessToken))).statusCode).toBe(401);
    expect((await get("/v1/admin/me", bearer(s1.accessToken))).statusCode).toBe(200);
    nextStep();
    expect((await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).statusCode).toBe(401);

    const fresh = await post("/v1/admin/auth/refresh", { refreshToken: s1.refreshToken });
    expect(fresh.statusCode).toBe(200);
    await post("/v1/admin/auth/logout", { refreshToken: fresh.json().refreshToken });
    expect((await get("/v1/admin/me", bearer(fresh.json().accessToken))).statusCode).toBe(401);
  });

  it("on a real deployment an admin without an authenticator can't sign in at all", async () => {
    await start();
    await t.app.services.admins.create(null, { username: "nofactor", name: "No factor" }, { password: "a-long-password", withAuthenticator: false });
    expect((await post("/v1/admin/auth/login", { username: "nofactor", password: "a-long-password" })).json().error.code).toBe("wrong_credentials");
  });

  it("admin sessions expire after 12 hours", async () => {
    await start();
    const a = await firstAdmin();
    const s = (await post("/v1/admin/auth/login", { username: "imdad", password: a.password, code: codeFor(a.authenticatorKey) })).json();
    clock.t += 12 * 3600_000 + 1000;
    expect((await get("/v1/admin/me", bearer(s.accessToken))).statusCode).toBe(401);
    expect((await post("/v1/admin/auth/refresh", { refreshToken: s.refreshToken })).statusCode).toBe(401);
  });

  it("demo shortcuts are switched off: no instant mock payments, no demo Google sign-in", async () => {
    await start();
    expect((await post("/v1/payments/mock/mock_order_x/succeed", undefined)).statusCode).toBe(404);
    const g = await post("/v1/auth/google", { idToken: "mock:attacker@gmail.com:Evil" });
    expect(g.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("customer app and partner app are separate", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const clock = { t: 1_800_000_000_000 };
  afterEach(async () => { await t.close(); });
  const get = (url: string, headers?: Record<string, string>) => t.app.inject({ method: "GET", url, headers });

  it("the same phone gets two separate sessions; neither opens the other app", async () => {
    t = await setupTestApp({ ENABLED_MODULES: "home" }, { now: () => new Date(clock.t) });
    const asCustomer = await t.login("9000000001", "customer");
    clock.t += 31_000; // OTP resend gap
    const asPartner = await t.login("9000000001", "partner");
    expect(asPartner.user.id).toBe(asCustomer.user.id); // one person underneath

    // Partner sign-in: partner screens yes, customer screens (profile, addresses, bookings, payments) no.
    expect((await get("/v1/m/home/pro/me", asPartner.headers)).statusCode).toBe(200);
    for (const url of ["/v1/me", "/v1/me/addresses", "/v1/m/home/bookings", "/v1/payments/00000000-0000-0000-0000-000000000000"]) {
      const r = await get(url, asPartner.headers);
      expect(r.json().error?.code, url).toBe("wrong_portal");
    }
    // Customer sign-in: the reverse.
    expect((await get("/v1/me", asCustomer.headers)).statusCode).toBe(200);
    for (const url of ["/v1/m/home/pro/me", "/v1/m/home/pro/jobs", "/v1/m/home/pro/earnings"]) {
      expect((await get(url, asCustomer.headers)).json().error.code, url).toBe("wrong_portal");
    }

    // Refreshing keeps the app; signing out of one leaves the other signed in.
    const refreshed = (await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: asPartner.refreshToken } })).json();
    const partnerHeaders = { authorization: `Bearer ${refreshed.accessToken}` };
    expect((await get("/v1/me", partnerHeaders)).json().error.code).toBe("wrong_portal");
    await t.app.inject({ method: "POST", url: "/v1/auth/logout", payload: { refreshToken: asCustomer.refreshToken } });
    expect((await get("/v1/me", asCustomer.headers)).statusCode).toBe(401);
    expect((await get("/v1/m/home/pro/me", partnerHeaders)).statusCode).toBe(200);
  });
});
