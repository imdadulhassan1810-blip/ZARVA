import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  HOME_DOC_RULES, homeProDocLabel, homeProRequiredDocs,
  type HomePro, type HomeProApply, type HomeProDocKind, type HomeProDocument, type HomeProIdType, type HomeProPayoutInput,
  type HomeProAvailability, type HomeProUpdate,
} from "@zarva/core";
import type { Db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import type { Vault } from "../../lib/vault";
import type { NotificationService } from "../../notify";
import { homeBookings, homeCategories, homeCities, homeProDocuments, homePros } from "./schema";

type ProRow = typeof homePros.$inferSelect;

/** Statuses in which a pro can still edit their sign-up details. */
const EDITABLE: ProRow["status"][] = ["draft", "pending", "rejected"];

/**
 * Never use this.db inside a transaction callback: the demo database has one connection, so it waits forever.
 *
 * Partner self sign-up: details → KYC documents → payout account → submit → admin approves
 * (or rejects with a reason, the pro fixes it and submits again).
 */
export class PartnerService {
  constructor(private db: Db, private vault: Vault, private notify: NotificationService, private now: () => Date) {}

  async proFor(userId: string): Promise<ProRow | undefined> {
    return this.db.query.homePros.findFirst({ where: eq(homePros.userId, userId) });
  }

  private async mine(userId: string): Promise<ProRow> {
    const p = await this.proFor(userId);
    if (!p) throw notFound("Partner profile");
    return p;
  }

  async me(userId: string): Promise<HomePro | null> {
    const p = await this.proFor(userId);
    return p ? this.toPro(p) : null;
  }

  private async checkCategories(ids: string[]) {
    const cats = await this.db.select({ id: homeCategories.id }).from(homeCategories).where(inArray(homeCategories.id, ids));
    if (cats.length !== new Set(ids).size) throw badRequest("invalid_category", "Unknown service category");
  }

  async apply(userId: string, input: HomeProApply): Promise<HomePro> {
    if (await this.proFor(userId)) throw conflict("already_applied", "You have already started a partner profile");
    // Pros are called by customers and get SMS updates: a verified mobile is a must.
    const u = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { phone: true } });
    if (!u?.phone) throw new AppError(403, "phone_required", "Add and verify your mobile number first");
    const city = await this.db.query.homeCities.findFirst({ where: eq(homeCities.id, input.cityId) });
    if (!city?.active) throw badRequest("city_not_live", "We are not taking partners in that city yet");
    await this.checkCategories(input.categoryIds);
    const [p] = await this.db
      .insert(homePros)
      .values({
        userId, name: input.name, cityId: input.cityId, categoryIds: [...new Set(input.categoryIds)], locality: input.locality || null,
        experienceYears: input.experienceYears ?? null, idType: input.idType ?? null, status: "draft",
        createdAt: this.now(), updatedAt: this.now(),
      })
      .returning();
    return this.toPro(p!);
  }

  async update(userId: string, patch: HomeProUpdate): Promise<HomePro> {
    const p = await this.mine(userId);
    if (!EDITABLE.includes(p.status)) throw forbidden("Your profile is approved. Call partner support to change these details.");
    if (patch.categoryIds) await this.checkCategories(patch.categoryIds);
    const [u] = await this.db
      .update(homePros)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.locality !== undefined ? { locality: patch.locality || null } : {}),
        ...(patch.categoryIds ? { categoryIds: [...new Set(patch.categoryIds)] } : {}),
        ...(patch.experienceYears !== undefined ? { experienceYears: patch.experienceYears } : {}),
        ...(patch.idType !== undefined ? { idType: patch.idType } : {}),
        updatedAt: this.now(),
      })
      .where(eq(homePros.id, p.id))
      .returning();
    return this.toPro(u!);
  }

  async uploadDocument(userId: string, kind: HomeProDocKind, mime: string, dataBase64: string): Promise<HomePro> {
    const p = await this.mine(userId);
    if (p.status === "suspended") throw forbidden("Your profile is suspended");
    const bytes = Buffer.from(dataBase64, "base64");
    if (bytes.length === 0 || bytes.length > HOME_DOC_RULES.maxBytes) throw badRequest("file_too_large", "File must be under 5 MB");
    if (!looksLike(mime, bytes)) throw badRequest("bad_file", "That file isn't a JPG, PNG or PDF");
    const values = {
      proId: p.id, kind, mime, sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), data: this.vault.encrypt(bytes), createdAt: this.now(),
    };
    await this.db.insert(homeProDocuments).values(values).onConflictDoUpdate({
      target: [homeProDocuments.proId, homeProDocuments.kind],
      set: { mime: values.mime, sizeBytes: values.sizeBytes, sha256: values.sha256, data: values.data, createdAt: values.createdAt },
    });
    return this.toPro(p);
  }

  async setPayout(userId: string, input: HomeProPayoutInput): Promise<HomePro> {
    const p = await this.mine(userId);
    if (p.status === "suspended") throw forbidden("Your profile is suspended");
    const hadDetails = !!(p.payoutUpi || p.payoutBankAccount);
    const [u] = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(homePros)
        .set({
          payoutAccountName: input.accountName, payoutUpi: input.upi ?? null,
          payoutBankAccount: input.bankAccount ?? null, payoutIfsc: input.ifsc ?? null, updatedAt: this.now(),
        })
        .where(eq(homePros.id, p.id))
        .returning();
      // Someone who takes over a pro's account would first redirect their money: tell the real pro.
      if (hadDetails) {
        await this.notify.notify(tx, {
          event: "pro_payout_details_changed", userId, vars: { destination: payoutDestination(rows[0]!) ?? "" },
          dedupeKey: `home:pro:${p.id}:payout-changed:${this.now().getTime()}`,
        });
      }
      return rows;
    });
    return this.toPro(u!);
  }

  async submit(userId: string): Promise<HomePro> {
    const p = await this.mine(userId);
    if (p.status !== "draft" && p.status !== "rejected") throw badRequest("not_submittable", "Your profile is already submitted");
    const missing = await this.missing(p);
    if (missing.length) throw new AppError(400, "profile_incomplete", `Still needed: ${missing.join(", ")}`, { missing });
    const [u] = await this.db
      .update(homePros)
      .set({ status: "pending", submittedAt: this.now(), rejectionReason: null, updatedAt: this.now() })
      .where(and(eq(homePros.id, p.id), inArray(homePros.status, ["draft", "rejected"])))
      .returning();
    if (!u) throw conflict("status_changed", "Profile changed meanwhile. Refresh.");
    return this.toPro(u);
  }

  // ---------- Admin ----------

  async list(): Promise<HomePro[]> {
    const rows = await this.db.select().from(homePros).orderBy(asc(homePros.status), asc(homePros.name));
    return Promise.all(rows.map((p) => this.toPro(p)));
  }

  /** Approve a submitted profile, suspend an active one, or re-activate a suspended one. */
  async setStatus(adminId: string, proId: string, to: "active" | "suspended"): Promise<HomePro> {
    const p = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId) });
    if (!p) throw notFound("Professional");
    const at = this.now();
    if (to === "suspended") {
      if (p.status !== "active") throw badRequest("invalid_transition", "Only active professionals can be suspended");
      const [u] = await this.db.update(homePros).set({ status: "suspended", reviewedBy: adminId, updatedAt: at }).where(eq(homePros.id, p.id)).returning();
      return this.toPro(u!);
    }
    if (p.status === "suspended" && p.approvedAt) {
      const [u] = await this.db.update(homePros).set({ status: "active", reviewedBy: adminId, updatedAt: at }).where(eq(homePros.id, p.id)).returning();
      return this.toPro(u!);
    }
    if (p.status !== "pending") throw badRequest("not_submitted", "This professional hasn't submitted their KYC yet");
    const missing = await this.missing(p);
    if (missing.length) throw badRequest("profile_incomplete", `Can't approve, still missing: ${missing.join(", ")}`);
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(homePros)
        .set({ status: "active", approvedAt: at, reviewedBy: adminId, rejectionReason: null, updatedAt: at })
        .where(and(eq(homePros.id, p.id), eq(homePros.status, "pending")))
        .returning();
      if (!u) throw conflict("status_changed", "Profile changed meanwhile. Refresh.");
      await this.notify.notify(tx, { event: "pro_approved", userId: p.userId, vars: { name: p.name.split(" ")[0] ?? p.name }, dedupeKey: `home:pro:${p.id}:approved` });
      return u;
    }).then((u) => this.toPro(u));
  }

  async reject(adminId: string, proId: string, reason: string): Promise<HomePro> {
    const p = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId) });
    if (!p) throw notFound("Professional");
    if (p.status !== "pending") throw badRequest("invalid_transition", "Only submitted profiles can be rejected");
    const at = this.now();
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(homePros)
        .set({ status: "rejected", rejectionReason: reason, reviewedBy: adminId, updatedAt: at })
        .where(and(eq(homePros.id, p.id), eq(homePros.status, "pending")))
        .returning();
      if (!u) throw conflict("status_changed", "Profile changed meanwhile. Refresh.");
      await this.notify.notify(tx, { event: "pro_rejected", userId: p.userId, vars: { reason }, dedupeKey: `home:pro:${p.id}:rejected:${at.getTime()}` });
      return u;
    }).then((u) => this.toPro(u));
  }

  async document(proId: string, kind: HomeProDocKind): Promise<{ mime: string; data: Buffer }> {
    const d = await this.db.query.homeProDocuments.findFirst({ where: and(eq(homeProDocuments.proId, proId), eq(homeProDocuments.kind, kind)) });
    if (!d) throw notFound("Document");
    return { mime: d.mime, data: this.vault.decrypt(d.data) };
  }

  // ---------- Helpers ----------

  private async docs(proId: string): Promise<HomeProDocument[]> {
    const rows = await this.db
      .select({ kind: homeProDocuments.kind, mime: homeProDocuments.mime, sizeBytes: homeProDocuments.sizeBytes, createdAt: homeProDocuments.createdAt })
      .from(homeProDocuments)
      .where(eq(homeProDocuments.proId, proId));
    return rows.map((r) => ({ kind: r.kind as HomeProDocKind, mime: r.mime, sizeBytes: r.sizeBytes, uploadedAt: r.createdAt.toISOString() }));
  }

  private async missing(p: ProRow, docs?: HomeProDocument[]): Promise<string[]> {
    const have = new Set((docs ?? (await this.docs(p.id))).map((d) => d.kind));
    const out: string[] = [];
    if (!p.idType) out.push("ID type");
    for (const k of homeProRequiredDocs) if (!have.has(k)) out.push(homeProDocLabel[k]);
    if (!p.payoutUpi && !p.payoutBankAccount) out.push("Payout account");
    return out;
  }

  /** On/off for new jobs, work days and hours. A pro can change these any time, also after approval. */
  async setAvailability(userId: string, a: HomeProAvailability): Promise<HomePro> {
    const p = await this.mine(userId);
    const [u] = await this.db
      .update(homePros)
      .set({ acceptingJobs: a.acceptingJobs, workDays: a.workDays, workStartHour: a.workStartHour, workEndHour: a.workEndHour, updatedAt: this.now() })
      .where(eq(homePros.id, p.id))
      .returning();
    return this.toPro(u!);
  }

  async toPro(p: ProRow): Promise<HomePro> {
    const [u, done, docs] = await Promise.all([
      this.db.query.users.findFirst({ where: eq(users.id, p.userId), columns: { phone: true } }),
      this.db.select({ n: sql<number>`count(*)::int` }).from(homeBookings).where(and(eq(homeBookings.proId, p.id), eq(homeBookings.status, "completed"))),
      this.docs(p.id),
    ]);
    return {
      id: p.id, userId: p.userId, name: p.name, phone: u?.phone ?? "", cityId: p.cityId, categoryIds: p.categoryIds,
      status: p.status, locality: p.locality, jobsDone: done[0]?.n ?? 0,
      experienceYears: p.experienceYears, idType: (p.idType as HomeProIdType | null) ?? null, rejectionReason: p.rejectionReason,
      submittedAt: p.submittedAt?.toISOString() ?? null,
      documents: docs,
      payout: {
        upi: p.payoutUpi, ifsc: p.payoutIfsc, accountName: p.payoutAccountName,
        bankAccountMasked: p.payoutBankAccount ? `XXXX${p.payoutBankAccount.slice(-4)}` : null,
      },
      availability: { acceptingJobs: p.acceptingJobs, workDays: p.workDays, workStartHour: p.workStartHour, workEndHour: p.workEndHour },
      missing: p.status === "draft" || p.status === "rejected" || p.status === "pending" ? await this.missing(p, docs) : [],
    };
  }
}

/** "UPI subrata@okaxis" / "A/c XXXX1234". Short enough for an SMS variable. */
export function payoutDestination(p: Pick<ProRow, "payoutUpi" | "payoutBankAccount">): string | null {
  if (p.payoutUpi) return `UPI ${p.payoutUpi}`;
  if (p.payoutBankAccount) return `A/c XXXX${p.payoutBankAccount.slice(-4)}`;
  return null;
}

/** Check the file's first bytes, not just what the browser claims it is. */
function looksLike(mime: string, b: Buffer): boolean {
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "application/pdf") return b.subarray(0, 5).toString("latin1") === "%PDF-";
  return false;
}
