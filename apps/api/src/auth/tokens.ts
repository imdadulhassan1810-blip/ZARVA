import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 60;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(secret: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Which app a token opens. Customer and partner tokens belong to users; admin tokens to admin_accounts. */
export type Portal = "customer" | "partner" | "admin";
const portals: readonly string[] = ["customer", "partner", "admin"];

export async function signAccessToken(secret: string, subjectId: string, sessionId: string, portal: Portal = "customer"): Promise<string> {
  return new SignJWT({ sid: sessionId, por: portal })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subjectId)
    .setIssuer("zarva")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<{ subjectId: string; sessionId: string; portal: Portal }> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "zarva", algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.sid !== "string") throw new Error("bad token");
  // Tokens from before portals existed were customer tokens.
  const portal = payload.por === undefined ? "customer" : payload.por;
  if (typeof portal !== "string" || !portals.includes(portal)) throw new Error("bad token");
  return { subjectId: payload.sub, sessionId: payload.sid, portal: portal as Portal };
}
