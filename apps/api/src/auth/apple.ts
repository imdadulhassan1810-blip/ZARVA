import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { unauthorized } from "../lib/errors";

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AppleVerifier {
  readonly mode: "live" | "mock";
  verify(identityToken: string): Promise<AppleIdentity>;
}

/**
 * Verifies the identity token that Sign in with Apple hands the iPhone app or the website.
 * Checks Apple's signature, that it was issued for OUR app (iOS bundle id or web Services ID),
 * and that it hasn't expired. Apple never puts the person's name in the token: the app sends it
 * separately, and only on the very first sign-in.
 */
export class LiveAppleVerifier implements AppleVerifier {
  readonly mode = "live" as const;
  private keys: JWTVerifyGetKey;
  constructor(private clientIds: string[], keys?: JWTVerifyGetKey) {
    if (clientIds.length === 0) throw new Error("APPLE_CLIENT_IDS is required");
    this.keys = keys ?? createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  }
  async verify(identityToken: string): Promise<AppleIdentity> {
    try {
      const { payload } = await jwtVerify(identityToken, this.keys, { issuer: "https://appleid.apple.com", audience: this.clientIds });
      if (!payload.sub) throw new Error("no sub");
      // Apple sends email_verified as a boolean or as the string "true".
      const verified = payload.email_verified === true || payload.email_verified === "true";
      return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email.toLowerCase() : null, emailVerified: verified };
    } catch {
      throw unauthorized("Apple sign-in could not be verified");
    }
  }
}

/**
 * Development stand-in so "Continue with Apple" works without an Apple developer account.
 * Accepts tokens shaped "mock:<email>". Refused in production by config.
 */
export class MockAppleVerifier implements AppleVerifier {
  readonly mode = "mock" as const;
  async verify(identityToken: string): Promise<AppleIdentity> {
    const m = /^mock:([^:\s]+@[^:\s]+)$/.exec(identityToken);
    if (!m) throw unauthorized("Demo Apple token must look like mock:you@icloud.com");
    const email = m[1]!.toLowerCase();
    return { sub: `mock-apple-${email}`, email, emailVerified: true };
  }
}
