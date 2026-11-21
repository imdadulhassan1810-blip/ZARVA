import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { AdminAccount, AdminCreated, AdminLoginResult, AuthTokens } from "@zarva/core";
import type { Db } from "../db/client";
import { adminAccounts, adminSessions } from "../db/schema";
import { ACCESS_TTL_SECONDS, newRefreshToken, sha256, signAccessToken } from "../auth/tokens";
import { AppError, badRequest, forbidden, notFound, tooMany, unauthorized } from "../lib/errors";
import type { Vault } from "../lib/vault";
import { DUMMY_HASH, generatePassword, hashPassword, verifyPassword } from "./passwords";
import { generateSecret, otpauthUrl, verifyTotp } from "./totp";

/** Admin sign-ins last a working day, not 60 days like customer sessions. */
export const ADMIN_SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

type Row = typeof adminAccounts.$inferSelect;

export function toAdmin(a: Row): AdminAccount {
  return {
    id: a.id, username: a.username, name: a.name, status: a.status, hasAuthenticator: a.totpSecretEnc !== null,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
  };
}

const WRONG = () => new AppError(401, "wrong_credentials", "Wrong username, password or code");

/**
 * ZARVA team accounts: username + password + authenticator code, issued by ZARVA.
 * Nothing here touches the users table, so an admin is never a customer or a partner.
 */
export class AdminAccountService {
  constructor(
    private db: Db,
    private vault: Vault,
    private secret: string,
    /** On a developer's machine an admin without an authenticator may sign in with just a password. */
    private devShortcuts: boolean,
    private now: () => Date = () => new Date(),
  ) {}

  private encryptSecret(s: string) {
    return this.vault.encrypt(Buffer.from(s)).toString("base64");
  }
  private decryptSecret(s: string) {
    return this.vault.decrypt(Buffer.from(s, "base64")).toString();
  }

  /** Creates a team account with a random starting password and a new authenticator key, both shown once. */
  async create(createdBy: string | null, input: { username: string; name: string }, opts: { password?: string; withAuthenticator?: boolean } = {}): Promise<AdminCreated> {
    const password = opts.password ?? generatePassword();
    const key = opts.withAuthenticator === false ? null : generateSecret();
    const inserted = await this.db
      .insert(adminAccounts)
      .values({
        username: input.username, name: input.name, passwordHash: await hashPassword(password),
        totpSecretEnc: key ? this.encryptSecret(key) : null, createdBy,
      })
      .onConflictDoNothing({ target: adminAccounts.username })
      .returning();
    if (!inserted[0]) throw new AppError(409, "username_taken", "That username is already used");
    return { admin: toAdmin(inserted[0]), password, authenticatorKey: key ?? "", authenticatorLink: key ? otpauthUrl(key, input.username) : "" };
  }

  async login(input: { username: string; password: string; code?: string }): Promise<AdminLoginResult> {
    const now = this.now();
    const a = await this.db.query.adminAccounts.findFirst({ where: eq(adminAccounts.username, input.username) });
    if (!a) {
      await verifyPassword(input.password, DUMMY_HASH);
      throw WRONG();
    }
    if (a.lockedUntil && a.lockedUntil > now) {
      throw tooMany("Too many wrong attempts. Try again later.", Math.ceil((a.lockedUntil.getTime() - now.getTime()) / 1000));
    }
    const passwordOk = await verifyPassword(input.password, a.passwordHash);
    let step: number | null = null;
    let codeOk = true;
    if (a.totpSecretEnc) {
      step = input.code ? verifyTotp(this.decryptSecret(a.totpSecretEnc), input.code, now) : null;
      codeOk = step !== null && (a.lastTotpStep === null || step > a.lastTotpStep);
    } else if (!this.devShortcuts) {
      // Every real admin has an authenticator; an account without one can't open the admin app.
      codeOk = false;
    }
    if (!passwordOk || !codeOk) {
      const fails = a.failedAttempts + 1;
      const lockedUntil = fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
      await this.db.update(adminAccounts).set({ failedAttempts: lockedUntil ? 0 : fails, lockedUntil, updatedAt: now }).where(eq(adminAccounts.id, a.id));
      // Say which part was missing only when the password was right, so the code box can appear.
      if (passwordOk && a.totpSecretEnc && !input.code) throw new AppError(401, "admin_code_required", "Enter the 6-digit code from your authenticator app");
      throw WRONG();
    }
    if (a.status !== "active") throw forbidden("This admin account is disabled");
    const [fresh] = await this.db
      .update(adminAccounts)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now, lastTotpStep: step ?? a.lastTotpStep, updatedAt: now })
      .where(eq(adminAccounts.id, a.id))
      .returning();
    return { ...(await this.createSession(a.id)), admin: toAdmin(fresh!) };
  }

  private async createSession(adminId: string): Promise<AuthTokens> {
    const { token, hash } = newRefreshToken();
    const [s] = await this.db
      .insert(adminSessions)
      .values({ adminId, tokenHash: hash, expiresAt: new Date(this.now().getTime() + ADMIN_SESSION_HOURS * 3600_000) })
      .returning({ id: adminSessions.id });
    return { accessToken: await signAccessToken(this.secret, adminId, s!.id, "admin"), refreshToken: token, expiresIn: ACCESS_TTL_SECONDS };
  }

  /** Rotates the refresh token within the original 12 hours; a reused token ends every session of that admin. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.now();
    const s = await this.db.query.adminSessions.findFirst({ where: eq(adminSessions.tokenHash, sha256(refreshToken)) });
    if (!s) throw unauthorized("Session not found");
    if (s.revokedAt) {
      await this.revokeAll(s.adminId);
      throw unauthorized("Session was revoked. Please sign in again");
    }
    if (s.expiresAt <= now) throw unauthorized("Session expired. Please sign in again");
    const admin = await this.db.query.adminAccounts.findFirst({ where: eq(adminAccounts.id, s.adminId) });
    if (admin?.status !== "active") throw unauthorized("This admin account is disabled");
    const revoked = await this.db.update(adminSessions).set({ revokedAt: now })
      .where(and(eq(adminSessions.id, s.id), isNull(adminSessions.revokedAt))).returning({ id: adminSessions.id });
    if (revoked.length === 0) throw unauthorized("Session was revoked. Please sign in again");
    const { token, hash } = newRefreshToken();
    const [n] = await this.db.insert(adminSessions).values({ adminId: s.adminId, tokenHash: hash, expiresAt: s.expiresAt }).returning({ id: adminSessions.id });
    return { accessToken: await signAccessToken(this.secret, s.adminId, n!.id, "admin"), refreshToken: token, expiresIn: ACCESS_TTL_SECONDS };
  }

  async logout(refreshToken: string) {
    await this.db.update(adminSessions).set({ revokedAt: this.now() }).where(eq(adminSessions.tokenHash, sha256(refreshToken)));
  }

  private async revokeAll(adminId: string, except?: string) {
    const where = except
      ? and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt), ne(adminSessions.id, except))
      : and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt));
    await this.db.update(adminSessions).set({ revokedAt: this.now() }).where(where);
  }

  /** For every admin request: live session of an active admin. */
  async isSessionActive(sessionId: string, adminId: string): Promise<boolean> {
    const s = await this.db.query.adminSessions.findFirst({ where: eq(adminSessions.id, sessionId) });
    if (!s || s.adminId !== adminId || s.revokedAt || s.expiresAt <= this.now()) return false;
    const a = await this.db.query.adminAccounts.findFirst({ where: eq(adminAccounts.id, adminId), columns: { status: true } });
    return a?.status === "active";
  }

  async get(id: string): Promise<AdminAccount> {
    const a = await this.db.query.adminAccounts.findFirst({ where: eq(adminAccounts.id, id) });
    if (!a) throw notFound("Admin");
    return toAdmin(a);
  }

  async list(): Promise<AdminAccount[]> {
    return (await this.db.select().from(adminAccounts).orderBy(asc(adminAccounts.createdAt))).map(toAdmin);
  }

  /** Disabling ends that admin's sessions at once. You can't disable yourself (so one admin always remains). */
  async setStatus(byAdminId: string, id: string, status: "active" | "disabled"): Promise<AdminAccount> {
    if (byAdminId === id && status === "disabled") throw badRequest("cannot_disable_self", "You can't disable your own account");
    const [a] = await this.db.update(adminAccounts).set({ status, failedAttempts: 0, lockedUntil: null, updatedAt: this.now() }).where(eq(adminAccounts.id, id)).returning();
    if (!a) throw notFound("Admin");
    if (status === "disabled") await this.revokeAll(id);
    return toAdmin(a);
  }

  /** Changing your password signs you out everywhere else. */
  async changePassword(adminId: string, sessionId: string, current: string, next: string): Promise<void> {
    const a = await this.db.query.adminAccounts.findFirst({ where: eq(adminAccounts.id, adminId) });
    if (!a || !(await verifyPassword(current, a.passwordHash))) throw badRequest("wrong_password", "Your current password is wrong");
    if (current === next) throw badRequest("same_password", "Choose a new password");
    await this.db.update(adminAccounts).set({ passwordHash: await hashPassword(next), updatedAt: this.now() }).where(eq(adminAccounts.id, adminId));
    await this.revokeAll(adminId, sessionId);
  }

  async count(): Promise<number> {
    return (await this.db.select({ id: adminAccounts.id }).from(adminAccounts)).length;
  }
}
