import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { unauthorized } from "../lib/errors";

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleVerifier {
  readonly mode: "live" | "mock";
  verify(idToken: string): Promise<GoogleIdentity>;
}

/**
 * Verifies the ID token that Google's Sign-In button hands the browser.
 * Checks Google's signature, that it was issued for OUR client id, and that it hasn't expired.
 */
export class LiveGoogleVerifier implements GoogleVerifier {
  readonly mode = "live" as const;
  private keys: JWTVerifyGetKey;
  constructor(private clientIds: string[], keys?: JWTVerifyGetKey) {
    if (clientIds.length === 0) throw new Error("GOOGLE_CLIENT_ID is required");
    this.keys = keys ?? createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  }
  async verify(idToken: string): Promise<GoogleIdentity> {
    try {
      const { payload } = await jwtVerify(idToken, this.keys, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: this.clientIds,
      });
      if (!payload.sub) throw new Error("no sub");
      return {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === "string" ? payload.name : null,
      };
    } catch {
      throw unauthorized("Google sign-in could not be verified");
    }
  }
}

/**
 * Development stand-in so "Continue with Google" works without Google keys.
 * Accepts tokens shaped "mock:<email>:<name>". Refused in production by config.
 */
export class MockGoogleVerifier implements GoogleVerifier {
  readonly mode = "mock" as const;
  async verify(idToken: string): Promise<GoogleIdentity> {
    const m = /^mock:([^:\s]+@[^:\s]+):?(.*)$/.exec(idToken);
    if (!m) throw unauthorized("Demo Google token must look like mock:you@gmail.com:Your Name");
    const email = m[1]!.toLowerCase();
    return { sub: `mock-${email}`, email, emailVerified: true, name: m[2]?.trim() || null };
  }
}
