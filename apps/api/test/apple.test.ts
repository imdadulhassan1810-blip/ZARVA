import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveAppleVerifier } from "../src/auth/apple";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeEach(async () => { t = await setupTestApp(); });
afterEach(async () => { await t.close(); });

const post = (url: string, payload: object, headers?: Record<string, string>) => t.app.inject({ method: "POST", url, payload, headers });

async function appleLogin(email: string, name?: string) {
  const r = await post("/v1/auth/apple", { identityToken: `mock:${email}`, ...(name ? { name } : {}) });
  const body = r.json();
  return { status: r.statusCode, ...body, headers: { authorization: `Bearer ${body.accessToken}` } };
}

describe("Sign in with Apple", () => {
  it("creates a customer account with the name Apple gave the app the first time", async () => {
    const a = await appleLogin("Riya@iCloud.com", "Riya Sen");
    expect(a.status).toBe(200);
    expect(a.isNewUser).toBe(true);
    expect(a.user).toMatchObject({ email: "riya@icloud.com", name: "Riya Sen", hasApple: true, hasGoogle: false, phone: null });

    // Second time Apple sends no name: same account, name kept.
    const again = await appleLogin("riya@icloud.com");
    expect(again.isNewUser).toBe(false);
    expect(again.user.id).toBe(a.user.id);
    expect(again.user.name).toBe("Riya Sen");
  });

  it("opens the customer app only, never the partner app", async () => {
    const a = await appleLogin("pro@icloud.com");
    const partner = await t.app.inject({ method: "GET", url: "/v1/m/home/pro/jobs", headers: a.headers });
    expect(partner.json().error.code).toBe("wrong_portal");
    expect(partner.statusCode).toBe(403);
    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: a.headers });
    expect(me.statusCode).toBe(200);
  });

  it("links to the account that already owns the verified email", async () => {
    const g = (await post("/v1/auth/google", { idToken: "mock:same@gmail.com:Same" })).json();
    const a = await appleLogin("same@gmail.com");
    expect(a.user.id).toBe(g.user.id);
    expect(a.user).toMatchObject({ hasGoogle: true, hasApple: true });
  });

  it("rejects a bad token, and the demo token once real Apple keys are set", async () => {
    expect((await post("/v1/auth/apple", { identityToken: "garbage-token" })).statusCode).toBe(401);
    await t.close();
    t = await setupTestApp({ APPLE_CLIENT_IDS: "in.zarva.app,in.zarva.web" });
    const p = (await t.app.inject({ method: "GET", url: "/v1/auth/providers" })).json();
    expect(p.apple).toEqual({ mode: "live", serviceId: "in.zarva.web" });
    expect((await post("/v1/auth/apple", { identityToken: "mock:a@icloud.com" })).statusCode).toBe(401);
  });
});

describe("LiveAppleVerifier", () => {
  it("accepts an Apple-signed token for our app id and rejects others", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "a1", alg: "RS256" };
    const v = new LiveAppleVerifier(["in.zarva.app"], createLocalJWKSet({ keys: [jwk] }));
    const sign = (claims: Record<string, unknown>, aud = "in.zarva.app", iss = "https://appleid.apple.com") =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "a1" }).setIssuer(iss).setAudience(aud).setSubject("001.abc").setIssuedAt().setExpirationTime("5m").sign(privateKey);

    // Apple sends email_verified as the string "true".
    expect(await v.verify(await sign({ email: "X@privaterelay.appleid.com", email_verified: "true" })))
      .toEqual({ sub: "001.abc", email: "x@privaterelay.appleid.com", emailVerified: true });
    await expect(v.verify(await sign({}, "someone.else.app"))).rejects.toMatchObject({ statusCode: 401 });
    await expect(v.verify(await sign({}, "in.zarva.app", "https://evil.example"))).rejects.toMatchObject({ statusCode: 401 });
  });
});
