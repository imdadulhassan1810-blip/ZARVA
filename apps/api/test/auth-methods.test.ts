import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveGoogleVerifier } from "../src/auth/google";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeEach(async () => { t = await setupTestApp(); });
afterEach(async () => { await t.close(); });

const post = (url: string, payload: object, headers?: Record<string, string>) => t.app.inject({ method: "POST", url, payload, headers });

async function emailLogin(email: string) {
  await post("/v1/auth/email/request", { email });
  const code = t.mail.last.get(email.trim().toLowerCase())!;
  const r = await post("/v1/auth/email/verify", { email, code });
  const body = r.json();
  return { status: r.statusCode, ...body, headers: { authorization: `Bearer ${body.accessToken}` } };
}

async function googleLogin(email: string, name = "Imdad") {
  const r = await post("/v1/auth/google", { idToken: `mock:${email}:${name}` });
  const body = r.json();
  return { status: r.statusCode, ...body, headers: { authorization: `Bearer ${body.accessToken}` } };
}

describe("providers", () => {
  it("advertises demo Google in development/test without keys", async () => {
    const r = (await t.app.inject({ method: "GET", url: "/v1/auth/providers" })).json();
    expect(r).toEqual({ phone: true, email: true, google: { mode: "mock", clientId: null }, apple: { mode: "mock", serviceId: null } });
  });
  it("advertises live Google with the client id when configured", async () => {
    await t.close();
    t = await setupTestApp({ GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" });
    const r = (await t.app.inject({ method: "GET", url: "/v1/auth/providers" })).json();
    expect(r.google).toEqual({ mode: "live", clientId: "123.apps.googleusercontent.com" });
    // The demo token must not work once real Google is configured.
    expect((await post("/v1/auth/google", { idToken: "mock:a@b.com:A" })).statusCode).toBe(401);
  });
});

describe("email sign-in", () => {
  it("signs up with an email code, with no phone yet", async () => {
    const s = await emailLogin("  Imdad@Example.COM ");
    expect(s.status).toBe(200);
    expect(s.isNewUser).toBe(true);
    expect(s.user).toMatchObject({ email: "imdad@example.com", phone: null, hasGoogle: false });
    await t.sql`update otp_challenges set created_at = now() - interval '1 minute'`;
    const again = await emailLogin("imdad@example.com");
    expect(again.isNewUser).toBe(false);
    expect(again.user.id).toBe(s.user.id);
  });
  it("rejects a wrong code and an invalid email", async () => {
    await post("/v1/auth/email/request", { email: "a@b.com" });
    const code = t.mail.last.get("a@b.com")!;
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await post("/v1/auth/email/verify", { email: "a@b.com", code: wrong })).json().error.code).toBe("otp_invalid");
    expect((await post("/v1/auth/email/request", { email: "nope" })).statusCode).toBe(400);
  });
  it("email codes cannot be used for a phone and vice versa", async () => {
    await post("/v1/auth/email/request", { email: "a@b.com" });
    const code = t.mail.last.get("a@b.com")!;
    expect((await post("/v1/auth/otp/verify", { phone: "9876543210", code })).statusCode).toBe(400);
  });
});

describe("Google sign-in", () => {
  it("creates an account with verified email and name", async () => {
    const s = await googleLogin("Imdad@Gmail.com", "Imdad Hassan");
    expect(s.status).toBe(200);
    expect(s.isNewUser).toBe(true);
    expect(s.user).toMatchObject({ email: "imdad@gmail.com", name: "Imdad Hassan", phone: null, hasGoogle: true });
    const again = await googleLogin("imdad@gmail.com");
    expect(again.user.id).toBe(s.user.id);
    expect(again.isNewUser).toBe(false);
  });
  it("links to an existing account that verified the same email", async () => {
    const byEmail = await emailLogin("imdad@gmail.com");
    const g = await googleLogin("imdad@gmail.com");
    expect(g.user.id).toBe(byEmail.user.id);
    expect(g.user.hasGoogle).toBe(true);
  });
  it("rejects malformed tokens", async () => {
    expect((await post("/v1/auth/google", { idToken: "garbage-token" })).statusCode).toBe(401);
  });
});

describe("adding a phone or email to an account", () => {
  it("Google user adds and verifies a phone, then can sign in with it", async () => {
    const g = await googleLogin("imdad@gmail.com");
    expect((await post("/v1/me/phone/request", { phone: "9876543210" }, g.headers)).statusCode).toBe(200);
    const code = t.otp.last.get("+919876543210")!;
    const r = await post("/v1/me/phone/verify", { phone: "9876543210", code }, g.headers);
    expect(r.json().user).toMatchObject({ phone: "+919876543210", email: "imdad@gmail.com" });
    await t.sql`update otp_challenges set created_at = now() - interval '1 minute'`;
    const byPhone = await t.login("9876543210");
    expect(byPhone.user.id).toBe(g.user.id);
  });
  it("refuses a phone that belongs to another account, before sending an SMS", async () => {
    await t.login("9876543210");
    const g = await googleLogin("other@gmail.com");
    t.otp.last.clear();
    const r = await post("/v1/me/phone/request", { phone: "9876543210" }, g.headers);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("phone_in_use");
    expect(t.otp.last.size).toBe(0);
  });
  it("phone user adds a verified email", async () => {
    const s = await t.login();
    await post("/v1/me/email/request", { email: "me@example.com" }, s.headers);
    const code = t.mail.last.get("me@example.com")!;
    const r = await post("/v1/me/email/verify", { email: "me@example.com", code }, s.headers);
    expect(r.json().user).toMatchObject({ email: "me@example.com", phone: "+919876543210" });
  });
  it("a code sent for one email cannot verify a different email", async () => {
    const s = await t.login();
    await post("/v1/me/email/request", { email: "me@example.com" }, s.headers);
    const code = t.mail.last.get("me@example.com")!;
    expect((await post("/v1/me/email/verify", { email: "victim@example.com", code }, s.headers)).statusCode).toBe(400);
  });
  it("profile update can no longer set an unverified email", async () => {
    const s = await t.login();
    const r = await t.app.inject({ method: "PATCH", url: "/v1/me", headers: s.headers, payload: { email: "x@y.com", name: "A" } });
    expect(r.json().user).toMatchObject({ name: "A", email: null });
  });
});

describe("phone required before paying", () => {
  it("blocks payments for accounts without a verified phone", async () => {
    const g = await googleLogin("nophone@gmail.com");
    await expect(
      t.app.services.payments.createForOrder({ userId: g.user.id, module: "home", referenceId: "b1", amountPaise: 49900, idempotencyKey: "k" }),
    ).rejects.toMatchObject({ code: "phone_required" });
  });
});

describe("LiveGoogleVerifier", () => {
  it("accepts a Google-signed token for our client id and rejects others", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const v = new LiveGoogleVerifier(["our-client"], createLocalJWKSet({ keys: [jwk] }));
    const sign = (claims: Record<string, unknown>, aud = "our-client", iss = "https://accounts.google.com") =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setSubject("g-123").setIssuedAt().setExpirationTime("5m").sign(privateKey);

    const ok = await v.verify(await sign({ email: "A@Gmail.com", email_verified: true, name: "A" }));
    expect(ok).toEqual({ sub: "g-123", email: "a@gmail.com", emailVerified: true, name: "A" });
    await expect(v.verify(await sign({}, "someone-elses-client"))).rejects.toMatchObject({ statusCode: 401 });
    await expect(v.verify(await sign({}, "our-client", "https://evil.example"))).rejects.toMatchObject({ statusCode: 401 });

    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://accounts.google.com").setAudience("our-client").setSubject("x").setExpirationTime("5m").sign(other.privateKey);
    await expect(v.verify(forged)).rejects.toMatchObject({ statusCode: 401 });
  });
});
