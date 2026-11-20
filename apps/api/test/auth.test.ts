import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { otpChallenges } from "../src/db/schema";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeEach(async () => { t = await setupTestApp(); });
afterEach(async () => { await t.close(); });

describe("phone OTP auth", () => {
  it("signs up a new user, then signs in the same user again", async () => {
    const first = await t.login("+91 98765 43210");
    expect(first.isNewUser).toBe(true);
    expect(first.user).toMatchObject({ phone: "+919876543210" });
    await t.sql`update otp_challenges set created_at = now() - interval '1 minute'`;
    const second = await t.login("9876543210");
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("rejects invalid phone numbers", async () => {
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "12345" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("validation_error");
  });

  it("rate limits resends within 30s", async () => {
    const p = { phone: "9876543210" };
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: p })).statusCode).toBe(200);
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: p });
    expect(r.statusCode).toBe(429);
  });

  it("caps OTP requests at 5 per hour", async () => {
    const values = Array.from({ length: 5 }, (_, i) => ({
      phone: "+919876543210", codeHash: "x", expiresAt: new Date(Date.now() + 1e5), createdAt: new Date(Date.now() - (i + 1) * 60_000),
    }));
    await t.db.insert(otpChallenges).values(values);
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "9876543210" } });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.message).toMatch(/hour/);
  });

  it("locks the OTP after 5 wrong attempts, even if the right code follows", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "9876543210" } });
    const code = t.otp.last.get("+919876543210")!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "9876543210", code: wrong } });
      expect(r.json().error.code).toBe("otp_invalid");
    }
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "9876543210", code } });
    expect(r.json().error.code).toBe("otp_locked");
  });

  it("does not accept the same OTP twice", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "9876543210" } });
    const code = t.otp.last.get("+919876543210")!;
    const payload = { phone: "9876543210", code };
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload })).statusCode).toBe(400);
  });

  it("rejects expired OTPs", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "9876543210" } });
    const code = t.otp.last.get("+919876543210")!;
    await t.sql`update otp_challenges set expires_at = now() - interval '1 second'`;
    const r = await t.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone: "9876543210", code } });
    expect(r.json().error.code).toBe("otp_expired");
  });

  it("does not store the OTP in plain text", async () => {
    await t.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "9876543210" } });
    const code = t.otp.last.get("+919876543210")!;
    const rows = await t.sql`select code_hash from otp_challenges`;
    expect(rows[0]!.code_hash).not.toContain(code);
    expect(rows[0]!.code_hash).toHaveLength(64);
  });
});

describe("sessions", () => {
  it("rotates refresh tokens and detects reuse of an old one", async () => {
    const s = await t.login();
    const r1 = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: s.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const fresh = r1.json();
    // Old token replayed (stolen?) -> revoke all sessions, including the fresh one.
    const replay = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: s.refreshToken } });
    expect(replay.statusCode).toBe(401);
    const after = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: fresh.refreshToken } });
    expect(after.statusCode).toBe(401);
  });

  it("logout cuts access immediately", async () => {
    const s = await t.login();
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: s.headers })).statusCode).toBe(200);
    await t.app.inject({ method: "POST", url: "/v1/auth/logout", payload: { refreshToken: s.refreshToken } });
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: s.headers })).statusCode).toBe(401);
  });

  it("rejects missing and forged tokens", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    const forged = { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad" };
    expect((await t.app.inject({ method: "GET", url: "/v1/me", headers: forged })).statusCode).toBe(401);
  });
});
