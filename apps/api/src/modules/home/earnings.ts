import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  bookingCode, formatRupees, homeCommission,
  type HomeEarnings, type HomeLedgerEntry, type HomePayout, type HomeProBalance,
} from "@zarva/core";
import { PayoutRejectedError, type PayoutDestination, type PayoutProvider } from "@zarva/payments";
import type { Db, Tx } from "../../db/client";
import { users } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { NotificationService } from "../../notify";
import type { CancellationService } from "./cancellations";
import { payoutDestination } from "./partners";
import { homeBookings, homeCategories, homePayoutEvents, homePayouts, homeProLedger, homePros } from "./schema";

type BookingRow = typeof homeBookings.$inferSelect;
type ProRow = typeof homePros.$inferSelect;
type PayoutRow = typeof homePayouts.$inferSelect;

/** Smallest payout: ₹100. Below that bank charges eat it. */
export const MIN_PAYOUT_PAISE = 10_000;

/**
 * What ZARVA owes each professional, and the money sent to them.
 * Every change is a new ledger row; the balance is the sum. See HomeLedgerKind in @zarva/core.
 */
export class EarningsService {
  constructor(
    private db: Db, private provider: PayoutProvider, private notify: NotificationService, private now: () => Date,
    private cancellations: CancellationService,
  ) {}

  /** Inside the transaction that marks the job completed. Idempotent per booking. */
  async recordJob(tx: Tx, b: BookingRow, pro: ProRow): Promise<void> {
    const cat = await tx.query.homeCategories.findFirst({ where: eq(homeCategories.id, b.categoryId), columns: { commissionBps: true } });
    const commission = homeCommission(b.subtotalPaise, cat?.commissionBps ?? 2000);
    const at = this.now();
    await tx.insert(homeProLedger).values({
      proId: pro.id, kind: "job_earning", amountPaise: b.subtotalPaise - commission, bookingId: b.id,
      grossPaise: b.subtotalPaise, commissionPaise: commission, createdAt: at,
    }).onConflictDoNothing();
    if (b.payMode === "after_service") {
      // The pro kept the customer's cash (job price + fee); that is money they hold for ZARVA.
      await tx.insert(homeProLedger).values({
        proId: pro.id, kind: "cash_collected", amountPaise: -b.totalPaise, bookingId: b.id, note: `Collected ${formatRupees(b.totalPaise)} from customer`, createdAt: at,
      }).onConflictDoNothing();
    }
  }

  async balance(db: Db | Tx, proId: string): Promise<number> {
    const [r] = await db.select({ n: sql<number>`coalesce(sum(${homeProLedger.amountPaise}), 0)::int` }).from(homeProLedger).where(eq(homeProLedger.proId, proId));
    return r?.n ?? 0;
  }

  async earnings(proId: string): Promise<HomeEarnings> {
    // Penalties for days that have ended are written first, so the balance shown is what will be paid.
    await this.cancellations.settle(proId);
    const weekAgo = new Date(this.now().getTime() - 7 * 86_400_000);
    const [balancePaise, week, penalties, cancelStats, rows, payouts] = await Promise.all([
      this.balance(this.db, proId),
      this.db
        .select({ sum: sql<number>`coalesce(sum(${homeProLedger.amountPaise}), 0)::int`, n: sql<number>`count(*)::int` })
        .from(homeProLedger)
        .where(and(eq(homeProLedger.proId, proId), eq(homeProLedger.kind, "job_earning"), gt(homeProLedger.createdAt, weekAgo))),
      this.db
        .select({ sum: sql<number>`coalesce(sum(${homeProLedger.amountPaise}), 0)::int` })
        .from(homeProLedger)
        .where(and(eq(homeProLedger.proId, proId), eq(homeProLedger.kind, "cancellation_penalty"), gt(homeProLedger.createdAt, weekAgo))),
      this.cancellations.stats(this.db, proId),
      this.db.select().from(homeProLedger).where(eq(homeProLedger.proId, proId)).orderBy(desc(homeProLedger.seq)).limit(100),
      this.db.select().from(homePayouts).where(eq(homePayouts.proId, proId)).orderBy(desc(homePayouts.createdAt)).limit(50),
    ]);
    const pro = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId), columns: { name: true } });
    return {
      balancePaise,
      weekPaise: week[0]?.sum ?? 0,
      jobsThisWeek: week[0]?.n ?? 0,
      penaltiesWeekPaise: -(penalties[0]?.sum ?? 0),
      cancelStats,
      entries: rows.map(toEntry),
      payouts: payouts.map((p) => toPayout(p, pro?.name ?? "")),
    };
  }

  async balances(): Promise<{ pros: HomeProBalance[]; payouts: HomePayout[] }> {
    await this.cancellations.settle();
    const pros = await this.db.select().from(homePros).where(inArray(homePros.status, ["active", "suspended"]));
    const sums = await this.db
      .select({ proId: homeProLedger.proId, n: sql<number>`sum(${homeProLedger.amountPaise})::int` })
      .from(homeProLedger)
      .groupBy(homeProLedger.proId);
    const last = await this.db
      .select({ proId: homePayouts.proId, at: sql<Date>`max(${homePayouts.createdAt})` })
      .from(homePayouts)
      .groupBy(homePayouts.proId);
    const phones = pros.length
      ? await this.db.select({ id: users.id, phone: users.phone }).from(users).where(inArray(users.id, pros.map((p) => p.userId)))
      : [];
    const sumBy = new Map(sums.map((s) => [s.proId, s.n]));
    const lastBy = new Map(last.map((l) => [l.proId, l.at]));
    const phoneBy = new Map(phones.map((u) => [u.id, u.phone]));
    const recent = await this.db.select().from(homePayouts).orderBy(desc(homePayouts.createdAt)).limit(50);
    const nameBy = new Map(pros.map((p) => [p.id, p.name]));
    return {
      pros: pros
        .map((p) => ({
          proId: p.id, name: p.name, phone: phoneBy.get(p.userId) ?? "", status: p.status, balancePaise: sumBy.get(p.id) ?? 0,
          payoutReady: !!payoutDestination(p), destination: payoutDestination(p),
          lastPayoutAt: lastBy.get(p.id) ? new Date(lastBy.get(p.id)!).toISOString() : null,
        }))
        .sort((a, b) => b.balancePaise - a.balancePaise),
      payouts: recent.map((p) => toPayout(p, nameBy.get(p.proId) ?? "")),
    };
  }

  async adjust(adminId: string, proId: string, amountPaise: number, note: string): Promise<number> {
    const pro = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId) });
    if (!pro) throw notFound("Professional");
    await this.db.insert(homeProLedger).values({ proId, kind: "adjustment", amountPaise, note, createdBy: adminId, createdAt: this.now() });
    return this.balance(this.db, proId);
  }

  /** Admin pays a pro. The ledger is debited first, so two clicks can never pay the same money twice. */
  async createPayout(adminId: string, proId: string, amountPaise: number, note: string | undefined): Promise<HomePayout> {
    if (!Number.isInteger(amountPaise) || amountPaise < MIN_PAYOUT_PAISE) throw badRequest("invalid_amount", `Minimum payout is ${formatRupees(MIN_PAYOUT_PAISE)}`);
    const pro = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId) });
    if (!pro) throw notFound("Professional");
    const dest = destinationOf(pro);
    if (!dest) throw badRequest("no_payout_account", `${pro.name} hasn't added a UPI ID or bank account`);
    await this.cancellations.settle(proId);

    const row = await this.db.transaction(async (tx) => {
      // One payout at a time per pro, so the balance check below can't be raced.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`home:payout:${proId}`}))`);
      const bal = await this.balance(tx, proId);
      if (amountPaise > bal) throw badRequest("exceeds_balance", `Balance is only ${formatRupees(Math.max(bal, 0))}`);
      const at = this.now();
      const [p] = await tx.insert(homePayouts).values({
        proId, amountPaise, status: "processing", provider: this.provider.name, destination: payoutDestination(pro)!,
        note: note || null, createdBy: adminId, createdAt: at, updatedAt: at,
      }).returning();
      await tx.insert(homeProLedger).values({ proId, kind: "payout", amountPaise: -amountPaise, payoutId: p!.id, note: note || null, createdBy: adminId, createdAt: at });
      return p!;
    });

    // Talk to the bank outside the transaction.
    try {
      const sent = await this.provider.send({
        payoutId: row.id, amountPaise, destination: dest, narration: "ZARVA partner payout", contactReference: pro.id,
      });
      if (sent.status === "paid") return this.markPaid(row.id, sent.utr ?? "", sent.providerPayoutId);
      const [u] = await this.db.update(homePayouts)
        .set({ status: sent.status === "manual" ? "manual" : "processing", providerPayoutId: sent.providerPayoutId, updatedAt: this.now() })
        .where(eq(homePayouts.id, row.id))
        .returning();
      return toPayout(u!, pro.name);
    } catch (e) {
      if (e instanceof PayoutRejectedError) return this.markFailed(row.id, e.message);
      // Unknown outcome (timeout, 5xx): keep the money debited and let a human check the dashboard.
      const [u] = await this.db.update(homePayouts)
        .set({ failureReason: `Status unknown: ${(e as Error).message}`.slice(0, 300), updatedAt: this.now() })
        .where(eq(homePayouts.id, row.id))
        .returning();
      return toPayout(u!, pro.name);
    }
  }

  async markPaid(payoutId: string, utr: string, providerPayoutId?: string | null): Promise<HomePayout> {
    return this.db.transaction(async (tx) => {
      const [u] = await tx.update(homePayouts)
        .set({ status: "paid", utr: utr || null, paidAt: this.now(), updatedAt: this.now(), failureReason: null, ...(providerPayoutId ? { providerPayoutId } : {}) })
        .where(and(eq(homePayouts.id, payoutId), inArray(homePayouts.status, ["processing", "manual"])))
        .returning();
      if (!u) return this.existing(tx, payoutId, "paid");
      const pro = await tx.query.homePros.findFirst({ where: eq(homePros.id, u.proId) });
      await this.notify.notify(tx, {
        event: "payout_paid", userId: pro!.userId,
        vars: { amount: formatRupees(u.amountPaise), destination: u.destination, utr: u.utr ?? "-" },
        dedupeKey: `home:payout:${u.id}:paid`,
      });
      return toPayout(u, pro!.name);
    });
  }

  async markFailed(payoutId: string, reason: string): Promise<HomePayout> {
    return this.db.transaction(async (tx) => {
      const [u] = await tx.update(homePayouts)
        .set({ status: "failed", failureReason: reason.slice(0, 300), updatedAt: this.now() })
        .where(and(eq(homePayouts.id, payoutId), inArray(homePayouts.status, ["processing", "manual"])))
        .returning();
      if (!u) return this.existing(tx, payoutId, "failed");
      // The money never left: give it back to the pro's balance.
      await tx.insert(homeProLedger).values({
        proId: u.proId, kind: "payout_reversal", amountPaise: u.amountPaise, payoutId: u.id, note: reason.slice(0, 200), createdAt: this.now(),
      }).onConflictDoNothing();
      const pro = await tx.query.homePros.findFirst({ where: eq(homePros.id, u.proId), columns: { name: true } });
      return toPayout(u, pro?.name ?? "");
    });
  }

  private async existing(tx: Tx, payoutId: string, wanted: PayoutRow["status"]): Promise<HomePayout> {
    const p = await tx.query.homePayouts.findFirst({ where: eq(homePayouts.id, payoutId) });
    if (!p) throw notFound("Payout");
    if (p.status !== wanted) throw conflict("payout_closed", `This payout is already ${p.status}`);
    const pro = await tx.query.homePros.findFirst({ where: eq(homePros.id, p.proId), columns: { name: true } });
    return toPayout(p, pro?.name ?? "");
  }

  /** RazorpayX tells us a payout settled or bounced. Deduped by event id. */
  async webhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<{ duplicate: boolean }> {
    const ev = this.provider.parseWebhook(rawBody, headers);
    const inserted = await this.db.insert(homePayoutEvents)
      .values({ provider: this.provider.name, eventId: ev.eventId, payload: JSON.parse(rawBody) as object })
      .onConflictDoNothing()
      .returning({ id: homePayoutEvents.id });
    if (inserted.length === 0) return { duplicate: true };
    const p = await this.db.query.homePayouts.findFirst({ where: eq(homePayouts.providerPayoutId, ev.providerPayoutId) });
    if (!p) return { duplicate: false };
    if (ev.status === "paid" && p.status !== "paid") await this.markPaid(p.id, ev.utr ?? "");
    if (ev.status === "failed" && p.status !== "failed") {
      if (p.status === "paid") {
        // Reversed after it was paid (bank bounced it later): put it back on the balance.
        await this.db.update(homePayouts).set({ status: "processing" }).where(eq(homePayouts.id, p.id));
      }
      await this.markFailed(p.id, ev.reason ?? "Bank rejected the payout");
    }
    return { duplicate: false };
  }
}


function destinationOf(p: ProRow): PayoutDestination | null {
  const name = p.payoutAccountName ?? p.name;
  if (p.payoutUpi) return { kind: "upi", vpa: p.payoutUpi, name };
  if (p.payoutBankAccount && p.payoutIfsc) return { kind: "bank", accountNumber: p.payoutBankAccount, ifsc: p.payoutIfsc, name };
  return null;
}

function toEntry(r: typeof homeProLedger.$inferSelect): HomeLedgerEntry {
  return {
    id: r.id, kind: r.kind, amountPaise: r.amountPaise, bookingCode: r.bookingId ? bookingCode(r.bookingId) : null, payoutId: r.payoutId,
    grossPaise: r.grossPaise, commissionPaise: r.commissionPaise, note: r.note, at: r.createdAt.toISOString(),
  };
}

function toPayout(p: PayoutRow, proName: string): HomePayout {
  return {
    id: p.id, proId: p.proId, proName, amountPaise: p.amountPaise, status: p.status, provider: p.provider, destination: p.destination,
    utr: p.utr, failureReason: p.failureReason, note: p.note, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
  };
}
