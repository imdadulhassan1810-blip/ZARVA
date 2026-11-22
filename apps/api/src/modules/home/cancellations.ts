import { and, eq, gte, lt, sql } from "drizzle-orm";
import { formatBps, formatRupees, istDate, istInstant, partnerPenaltyBps, type HomePartnerCancelStats } from "@zarva/core";
import type { Db, Tx } from "../../db/client";
import type { PolicyService } from "./policy";
import { homeProCancellations, homeProLedger, homeProPenalties } from "./schema";

/** Monday of the India-time week that `day` ("YYYY-MM-DD") is in. */
export function weekStart(day: string): string {
  const noon = istInstant(day, 12);
  const dow = (noon.getUTCDay() + 6) % 7; // Monday = 0
  return istDate(new Date(noon.getTime() - dow * 86_400_000));
}

/**
 * Partner cancellations: counted per India-time day and Monday-Sunday week. Past the free ones in a
 * day, a share of that day's earnings is deducted. The deduction is written once the day is over
 * (when the day's earnings are final), as a ledger row, so it comes off the next weekly payout.
 */
export class CancellationService {
  constructor(private db: Db, private policy: PolicyService, private now: () => Date) {}

  async stats(db: Db | Tx, proId: string): Promise<HomePartnerCancelStats> {
    const p = await this.policy.get();
    const today = istDate(this.now());
    const [r] = await db
      .select({
        today: sql<number>`count(*) filter (where ${homeProCancellations.day} = ${today})::int`,
        week: sql<number>`count(*)::int`,
      })
      .from(homeProCancellations)
      .where(and(eq(homeProCancellations.proId, proId), gte(homeProCancellations.day, weekStart(today))));
    const t = r?.today ?? 0;
    const w = r?.week ?? 0;
    return {
      today: t, week: w, freePerDay: p.partnerFreeCancelsPerDay, maxPerWeek: p.partnerMaxCancelsPerWeek,
      todayPenaltyBps: partnerPenaltyBps(p, t), nextPenaltyBps: partnerPenaltyBps(p, t + 1),
      canCancel: w < p.partnerMaxCancelsPerWeek,
    };
  }

  /** Inside the transaction that takes the job off the pro. */
  async record(tx: Tx, proId: string, bookingId: string, reason: string): Promise<void> {
    await tx.insert(homeProCancellations).values({ proId, bookingId, day: istDate(this.now()), reason, createdAt: this.now() });
  }

  /**
   * Writes the penalty for every finished day on which a pro cancelled too many jobs. Safe to call
   * any number of times (one penalty per pro per day). Called before earnings are shown or paid out.
   */
  async settle(proId?: string): Promise<void> {
    const p = await this.policy.get();
    const today = istDate(this.now());
    const due = await this.db
      .select({ proId: homeProCancellations.proId, day: homeProCancellations.day, n: sql<number>`count(*)::int` })
      .from(homeProCancellations)
      .where(and(
        lt(homeProCancellations.day, today),
        proId ? eq(homeProCancellations.proId, proId) : undefined,
        sql`not exists (select 1 from ${homeProPenalties} where ${homeProPenalties.proId} = ${homeProCancellations.proId} and ${homeProPenalties.day} = ${homeProCancellations.day})`,
      ))
      .groupBy(homeProCancellations.proId, homeProCancellations.day)
      .having(sql`count(*) > ${p.partnerFreeCancelsPerDay}`);

    for (const d of due) {
      const from = istInstant(d.day, 0);
      const to = new Date(from.getTime() + 86_400_000);
      const [e] = await this.db
        .select({ n: sql<number>`coalesce(sum(${homeProLedger.amountPaise}), 0)::int` })
        .from(homeProLedger)
        .where(and(
          eq(homeProLedger.proId, d.proId), eq(homeProLedger.kind, "job_earning"),
          gte(homeProLedger.createdAt, from), lt(homeProLedger.createdAt, to),
        ));
      const earned = Math.max(e?.n ?? 0, 0);
      const bps = partnerPenaltyBps(p, d.n);
      const penalty = Math.floor((earned * bps) / 10_000);
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(homeProPenalties)
          .values({ proId: d.proId, day: d.day, cancellations: d.n, penaltyBps: bps, dayEarningsPaise: earned, penaltyPaise: penalty, createdAt: this.now() })
          .onConflictDoNothing()
          .returning();
        if (row && penalty > 0) {
          await tx.insert(homeProLedger).values({
            proId: d.proId, kind: "cancellation_penalty", amountPaise: -penalty, createdAt: this.now(),
            note: `${d.n} jobs cancelled on ${d.day}: ${formatBps(bps)} of that day's earnings (${formatRupees(earned)})`,
          });
        }
      });
    }
  }
}
