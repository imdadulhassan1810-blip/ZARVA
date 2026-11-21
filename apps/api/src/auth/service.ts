import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { AuthTokens, LoginResult, PublicUser } from "@zarva/core";
import type { Db } from "../db/client";
import { otpChallenges, sessions, users } from "../db/schema";
import { AppError, badRequest, tooMany, unauthorized, pgErrorCode } from "../lib/errors";
import type { EmailSender } from "./email-sender";
import type { GoogleVerifier } from "./google";
import type { OtpSender } from "./otp-sender";
import {
  type Portal, ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS, generateOtp, hashOtp, newRefreshToken, sha256, signAccessToken,
} from "./tokens";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;

type UserRow = typeof users.$inferSelect;
/** Where a one-time code goes. Phone is E.164, email is lower-case; both already validated. */
export type CodeTarget = { kind: "phone"; value: string } | { kind: "email"; value: string };
/** The two apps a user can sign in to. Admins sign in elsewhere (admin/accounts.ts). */
export type UserPortal = Exclude<Portal, "admin">;

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    hasGoogle: u.googleSub !== null,
    preferredLanguage: u.preferredLanguage,
    whatsappOptIn: u.whatsappOptIn,
    createdAt: u.createdAt.toISOString(),
  };
}

export interface AuthDeps {
  db: Db;
  secret: string;
  sms: OtpSender;
  email: EmailSender;
  google: GoogleVerifier | null;
  now?: () => Date;
  /** Abuse limits on sending codes. Every text costs money, so these cap the bill. */
  limits?: Partial<CodeLimits>;
}

export interface CodeLimits {
  /** Codes (SMS + email) one internet address may request per hour. */
  perIpPerHour: number;
  /** SMS codes the whole platform may send per hour. A ceiling on the SMS bill even if an attacker rotates addresses. */
  smsPerHour: number;
}
export const DEFAULT_CODE_LIMITS: CodeLimits = { perIpPerHour: 20, smsPerHour: 500 };

/**
 * Three ways in: phone OTP, email code, Google. They all land on the same users table.
 * A phone or email is stored on a user only after it is verified, so "the user with this
 * phone/email" is always unambiguous and accounts can't be hijacked by typing someone else's.
 */
export class AuthService {
  private db: Db;
  private secret: string;
  private now: () => Date;
  private limits: CodeLimits;
  constructor(private deps: AuthDeps) {
    this.limits = { ...DEFAULT_CODE_LIMITS, ...deps.limits };
    this.db = deps.db;
    this.secret = deps.secret;
    this.now = deps.now ?? (() => new Date());
  }

  get googleMode(): "live" | "mock" | "off" {
    return this.deps.google?.mode ?? "off";
  }

  private column(t: CodeTarget) {
    return t.kind === "phone" ? otpChallenges.phone : otpChallenges.email;
  }

  /** Sends a 6-digit code by SMS or email, with resend and hourly limits per destination. */
  async requestCode(target: CodeTarget, ip?: string): Promise<{ retryAfter: number }> {
    const now = this.now();
    const col = this.column(target);
    const hourAgo = new Date(now.getTime() - 3600_000);
    const recent = await this.db
      .select({ createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(and(eq(col, target.value), gt(otpChallenges.createdAt, hourAgo)))
      .orderBy(desc(otpChallenges.createdAt));

    const last = recent[0];
    if (last) {
      const elapsed = (now.getTime() - last.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_SECONDS - elapsed);
        throw tooMany(`Please wait ${wait}s before requesting another code`, wait);
      }
    }
    if (recent.length >= OTP_MAX_PER_HOUR) throw tooMany("Too many code requests. Try again in an hour", 3600);

    // Stop one address (a script) asking codes for thousands of different numbers.
    if (ip) {
      const [byIp] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(otpChallenges)
        .where(and(eq(otpChallenges.ip, ip), gt(otpChallenges.createdAt, hourAgo)));
      if ((byIp?.n ?? 0) >= this.limits.perIpPerHour) throw tooMany("Too many code requests from this network. Try again in an hour", 3600);
    }
    // A ceiling on the SMS bill for the whole platform, even if the requests come from many addresses.
    if (target.kind === "phone") {
      const [sms] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(otpChallenges)
        .where(and(sql`${otpChallenges.phone} is not null`, gt(otpChallenges.createdAt, hourAgo)));
      if ((sms?.n ?? 0) >= this.limits.smsPerHour) {
        console.error(`[auth] hourly SMS code limit (${this.limits.smsPerHour}) reached: possible SMS abuse`);
        throw tooMany("Sign-in by SMS is very busy right now. Try again in a few minutes, or sign in with email.", 300);
      }
    }

    const code = generateOtp();
    // Only the newest code works.
    await this.db.update(otpChallenges).set({ consumedAt: now }).where(and(eq(col, target.value), isNull(otpChallenges.consumedAt)));
    await this.db.insert(otpChallenges).values({
      phone: target.kind === "phone" ? target.value : null,
      email: target.kind === "email" ? target.value : null,
      codeHash: hashOtp(this.secret, target.value, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      ip,
      createdAt: now,
    });
    if (target.kind === "phone") await this.deps.sms.send(target.value, code);
    else await this.deps.email.sendCode(target.value, code);
    return { retryAfter: OTP_RESEND_SECONDS };
  }

  /** Checks and consumes a code. Throws on wrong, expired, reused or locked codes. */
  private async consumeCode(target: CodeTarget, code: string): Promise<void> {
    const now = this.now();
    const col = this.column(target);
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(and(eq(col, target.value), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, now)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (!challenge) throw badRequest("otp_expired", "Code expired or not requested. Request a new one");
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("otp_locked", "Too many wrong attempts. Request a new code");

    if (challenge.codeHash !== hashOtp(this.secret, target.value, code)) {
      await this.db.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, challenge.id));
      throw badRequest("otp_invalid", "Incorrect code");
    }
    // Atomic, so the same code cannot be used twice in a race.
    const consumed = await this.db
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    if (consumed.length === 0) throw badRequest("otp_expired", "Code already used");
  }

  // ----- Phone (kept as named methods: existing callers and tests use them) -----
  requestOtp(phone: string, ip?: string) {
    return this.requestCode({ kind: "phone", value: phone }, ip);
  }
  verifyOtp(phone: string, code: string, deviceName?: string, portal: UserPortal = "customer") {
    return this.loginWithCode({ kind: "phone", value: phone }, code, deviceName, portal);
  }

  /** Sign in (or sign up) with a phone or email code. */
  async loginWithCode(target: CodeTarget, code: string, deviceName?: string, portal: UserPortal = "customer"): Promise<LoginResult> {
    // Partners are identified by their mobile number (payouts, SMS, KYC), so the partner app is phone-only.
    if (portal === "partner" && target.kind !== "phone") throw badRequest("partner_phone_only", "Partners sign in with their mobile number");
    await this.consumeCode(target, code);
    const now = this.now();
    const values = target.kind === "phone" ? { phone: target.value, phoneVerifiedAt: now } : { email: target.value, emailVerifiedAt: now };
    const conflict = target.kind === "phone" ? users.phone : users.email;
    const inserted = await this.db.insert(users).values(values).onConflictDoNothing({ target: conflict }).returning();
    const user = inserted[0] ?? (await this.db.query.users.findFirst({ where: eq(conflict, target.value) }));
    if (!user) throw new AppError(500, "internal", "User not found after upsert");
    return this.finishLogin(user, inserted.length > 0, deviceName, portal);
  }

  /**
   * Google: find by Google id; else link to the account that already owns this verified email;
   * else create a new account.
   */
  async loginWithGoogle(idToken: string, deviceName?: string): Promise<LoginResult> {
    if (!this.deps.google) throw new AppError(404, "google_disabled", "Google sign-in is not enabled");
    const g = await this.deps.google.verify(idToken);
    const email = g.email && g.emailVerified ? g.email : null;
    const now = this.now();

    let user = await this.db.query.users.findFirst({ where: eq(users.googleSub, g.sub) });
    let isNew = false;
    if (!user && email) {
      const byEmail = await this.db.query.users.findFirst({ where: eq(users.email, email) });
      if (byEmail) {
        [user] = await this.db.update(users).set({ googleSub: g.sub, updatedAt: now }).where(eq(users.id, byEmail.id)).returning();
      }
    }
    if (!user) {
      const inserted = await this.db
        .insert(users)
        .values({ googleSub: g.sub, email, emailVerifiedAt: email ? now : null, name: g.name })
        .onConflictDoNothing()
        .returning();
      user = inserted[0] ?? (await this.db.query.users.findFirst({ where: eq(users.googleSub, g.sub) }));
      isNew = inserted.length > 0;
    }
    if (!user) throw new AppError(500, "internal", "User not found after Google sign-in");
    return this.finishLogin(user, isNew, deviceName);
  }

  /** Add a verified phone or email to a signed-in account. */
  async linkWithCode(userId: string, target: CodeTarget, code: string): Promise<PublicUser> {
    await this.assertLinkable(userId, target);
    await this.consumeCode(target, code);
    const now = this.now();
    const set = target.kind === "phone" ? { phone: target.value, phoneVerifiedAt: now } : { email: target.value, emailVerifiedAt: now };
    try {
      const [u] = await this.db.update(users).set({ ...set, updatedAt: now }).where(eq(users.id, userId)).returning();
      return toPublicUser(u!);
    } catch (e) {
      // Unique violation: someone else linked it between our check and the update.
      if (pgErrorCode(e) === "23505") throw new AppError(409, `${target.kind}_in_use`, "Already linked to another account");
      throw e;
    }
  }

  /** Before sending a link code, refuse early if another account owns it (saves an SMS). */
  async assertLinkable(userId: string, target: CodeTarget): Promise<void> {
    const col = target.kind === "phone" ? users.phone : users.email;
    const owner = await this.db.query.users.findFirst({ where: eq(col, target.value), columns: { id: true } });
    if (owner && owner.id !== userId) {
      const what = target.kind === "phone" ? "mobile number" : "email";
      throw new AppError(409, `${target.kind}_in_use`, `This ${what} is already linked to another ZARVA account. Sign in with it instead.`);
    }
  }

  private async finishLogin(user: UserRow, isNewUser: boolean, deviceName?: string, portal: UserPortal = "customer"): Promise<LoginResult> {
    if (user.status !== "active") throw new AppError(403, "account_blocked", "This account is not active");
    const tokens = await this.createSession(user.id, deviceName, portal);
    return { ...tokens, user: toPublicUser(user), isNewUser };
  }

  /** Each session belongs to one app: a partner sign-in never opens the customer app, and the reverse. */
  private async createSession(userId: string, deviceName: string | undefined, portal: UserPortal): Promise<AuthTokens> {
    const { token, hash } = newRefreshToken();
    const [s] = await this.db
      .insert(sessions)
      .values({ userId, tokenHash: hash, deviceName, portal, expiresAt: new Date(this.now().getTime() + REFRESH_TTL_DAYS * 86400_000) })
      .returning({ id: sessions.id });
    return { accessToken: await signAccessToken(this.secret, userId, s!.id, portal), refreshToken: token, expiresIn: ACCESS_TTL_SECONDS };
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
    return this.createSession(s.userId, s.deviceName ?? undefined, s.portal);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: this.now() }).where(eq(sessions.tokenHash, sha256(refreshToken)));
  }

  /** Live, not logged out, and opened in this app. */
  async isSessionActive(sessionId: string, portal: UserPortal = "customer"): Promise<boolean> {
    const s = await this.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId), columns: { revokedAt: true, expiresAt: true, portal: true } });
    return !!s && !s.revokedAt && s.expiresAt > this.now() && s.portal === portal;
  }
}
