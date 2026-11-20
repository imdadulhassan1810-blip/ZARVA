import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminUnlocks, users } from "../db/schema";
import { AppError, forbidden, tooMany } from "../lib/errors";
import { parse } from "../lib/validate";
import { verifyTotp } from "./totp";

const UNLOCK_HOURS = 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

/**
 * Who is an admin, decided on the server for every admin request:
 *  1. signed in (valid, not-logged-out session),
 *  2. the account's VERIFIED phone is in ADMIN_PHONES,
 *  3. this session was unlocked with a 6-digit authenticator code in the last 8 hours
 *     (required on every real deployment; optional on a developer's machine).
 */
export function registerAdminGuard(app: FastifyInstance) {
  const cfg = app.config;
  const admins = new Set(cfg.adminPhones);

  async function adminPhoneOf(req: FastifyRequest): Promise<string | null> {
    const u = await app.db.query.users.findFirst({ where: eq(users.id, req.userId!) });
    return u?.phone && admins.has(u.phone) ? u.phone : null;
  }

  /** Second factor is needed when this admin has a secret, and always outside local dev. */
  const needsCode = (phone: string) => cfg.adminTotp.has(phone) || !cfg.devShortcuts;

  async function isUnlocked(sessionId: string): Promise<boolean> {
    const row = await app.db.query.adminUnlocks.findFirst({ where: eq(adminUnlocks.sessionId, sessionId) });
    return !!row?.unlockedUntil && row.unlockedUntil > app.now();
  }

  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    await app.requireAuth(req, undefined as never);
    const phone = await adminPhoneOf(req);
    if (!phone) throw forbidden("Admins only");
    if (needsCode(phone) && !(await isUnlocked(req.sessionId!))) {
      throw new AppError(403, "admin_code_required", "Enter the 6-digit code from your authenticator app");
    }
  });

  app.register(async (r) => {
    r.addHook("preHandler", app.requireAuth);

    r.get("/v1/admin/status", async (req) => {
      const phone = await adminPhoneOf(req);
      if (!phone) return { admin: false, needsCode: false, unlocked: false };
      const need = needsCode(phone);
      return { admin: true, needsCode: need, unlocked: need ? await isUnlocked(req.sessionId!) : true };
    });

    r.post("/v1/admin/unlock", async (req) => {
      const { code } = parse(z.object({ code: z.string().trim() }), req.body);
      const phone = await adminPhoneOf(req);
      if (!phone) throw forbidden("Admins only");
      const secret = cfg.adminTotp.get(phone);
      if (!secret) throw new AppError(400, "admin_code_not_set_up", "No authenticator is set up for this admin. Run pnpm admin:2fa.");
      const now = app.now();
      const sessionId = req.sessionId!;
      const row = await app.db.query.adminUnlocks.findFirst({ where: eq(adminUnlocks.sessionId, sessionId) });
      if (row?.lockedUntil && row.lockedUntil > now) {
        throw tooMany("Too many wrong codes. Try again later.", Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000));
      }
      const step = verifyTotp(secret, code, now);
      if (step === null || (row?.lastStep != null && step <= row.lastStep)) {
        const fails = (row?.failedAttempts ?? 0) + 1;
        const lockedUntil = fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
        await app.db.insert(adminUnlocks)
          .values({ sessionId, failedAttempts: lockedUntil ? 0 : fails, lockedUntil, updatedAt: now })
          .onConflictDoUpdate({ target: adminUnlocks.sessionId, set: { failedAttempts: lockedUntil ? 0 : fails, lockedUntil, updatedAt: now } });
        throw new AppError(400, "wrong_admin_code", "Wrong or already-used code");
      }
      const unlockedUntil = new Date(now.getTime() + UNLOCK_HOURS * 3600_000);
      await app.db.insert(adminUnlocks)
        .values({ sessionId, unlockedUntil, failedAttempts: 0, lockedUntil: null, lastStep: step, updatedAt: now })
        .onConflictDoUpdate({ target: adminUnlocks.sessionId, set: { unlockedUntil, failedAttempts: 0, lockedUntil: null, lastStep: step, updatedAt: now } });
      return { unlocked: true, until: unlockedUntil.toISOString() };
    });
  });
}
