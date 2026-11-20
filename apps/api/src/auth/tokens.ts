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

export async function signAccessToken(secret: string, userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("zarva")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<{ userId: string; sessionId: string }> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "zarva", algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.sid !== "string") throw new Error("bad token");
  return { userId: payload.sub, sessionId: payload.sid };
}
