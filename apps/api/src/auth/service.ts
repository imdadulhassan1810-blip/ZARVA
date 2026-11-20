import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { AuthTokens, PublicUser } from "@zarva/core";
import type { Db } from "../db/client";
import { otpChallenges, sessions, users } from "../db/schema";
import { AppError, badRequest, tooMany, unauthorized } from "../lib/errors";
import type { OtpSender } from "./otp-sender";
import {
  ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS, generateOtp, hashOtp, newRefreshToken, sha256, signAccessToken,
} from "./tokens";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;

export function toPublicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    preferredLanguage: u.preferredLanguage,
    createdAt: u.createdAt.toISOString(),
  };
}

export class AuthService {
  constructor(private db: Db, private secret: string, private sender: OtpSender, private now: () => Date = () => new Date()) {}

  async requestOtp(phone: string, ip?: string): Promise<{ retryAfter: number }> {
    const now = this.now();
    const hourAgo = new Date(now.getTime() - 3600_000);
    const recent = await this.db
      .select({ createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), gt(otpChallenges.createdAt, hourAgo)))
      .orderBy(desc(otpChallenges.createdAt));

    const last = recent[0];
    if (last) {
      const elapsed = (now.getTime() - last.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_SECONDS - elapsed);
        throw tooMany(`Please wait ${wait}s before requesting another OTP`, wait);
      }
    }
    if (recent.length >= OTP_MAX_PER_HOUR) throw tooMany("Too many OTP requests. Try again in an hour", 3600);

    const code = generateOtp();
    // Invalidate older open challenges so only the newest code works.
    await this.db
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));
    await this.db.insert(otpChallenges).values({
      phone,
      codeHash: hashOtp(this.secret, phone, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      ip,
      createdAt: now,
    });
    await this.sender.send(phone, code);
    return { retryAfter: OTP_RESEND_SECONDS };
  }

  async verifyOtp(phone: string, code: string, deviceName?: string): Promise<AuthTokens & { user: PublicUser; isNewUser: boolean }> {
    const now = this.now();
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, now)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (!challenge) throw badRequest("otp_expired", "OTP expired or not requested. Request a new one");
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("otp_locked", "Too many wrong attempts. Request a new OTP");

    if (challenge.codeHash !== hashOtp(this.secret, phone, code)) {
      await this.db
        .update(otpChallenges)
        .set({ attempts: sql`${otpChallenges.attempts} + 1` })
        .where(eq(otpChallenges.id, challenge.id));
      throw badRequest("otp_invalid", "Incorrect OTP");
    }

    // Consume atomically so the same code cannot be used twice in a race.
    const consumed = await this.db
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    if (consumed.length === 0) throw badRequest("otp_expired", "OTP already used");

    const inserted = await this.db.insert(users).values({ phone }).onConflictDoNothing({ target: users.phone }).returning();
    const isNewUser = inserted.length > 0;
    const user = inserted[0] ?? (await this.db.query.users.findFirst({ where: eq(users.phone, phone) }));
    if (!user) throw new AppError(500, "internal", "User not found after upsert");
    if (user.status !== "active") throw new AppError(403, "account_blocked", "This account is not active");

    const tokens = await this.createSession(user.id, deviceName);
    return { ...tokens, user: toPublicUser(user), isNewUser };
  }

  private async createSession(userId: string, deviceName?: string): Promise<AuthTokens> {
    const { token, hash } = newRefreshToken();
    const [s] = await this.db
      .insert(sessions)
      .values({ userId, tokenHash: hash, deviceName, expiresAt: new Date(this.now().getTime() + REFRESH_TTL_DAYS * 86400_000) })
      .returning({ id: sessions.id });
    return { accessToken: await signAccessToken(this.secret, userId, s!.id), refreshToken: token, expiresIn: ACCESS_TTL_SECONDS };
  }

  /** Rotates the refresh token. Re-use of a revoked token revokes every session of that user. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.now();
    const s = await this.db.query.sessions.findFirst({ where: eq(sessions.tokenHash, sha256(refreshToken)) });
    if (!s) throw unauthorized("Session not found");
    if (s.revokedAt) {
      await this.db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, s.userId), isNull(sessions.revokedAt)));
      throw unauthorized("Session was revoked. Please sign in again");
    }
    if (s.expiresAt <= now) throw unauthorized("Session expired. Please sign in again");
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, s.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (revoked.length === 0) throw unauthorized("Session was revoked. Please sign in again");
    return this.createSession(s.userId, s.deviceName ?? undefined);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: this.now() }).where(eq(sessions.tokenHash, sha256(refreshToken)));
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const s = await this.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId), columns: { revokedAt: true, expiresAt: true } });
    return !!s && !s.revokedAt && s.expiresAt > this.now();
  }
}
