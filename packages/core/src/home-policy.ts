import { z } from "zod";

/**
 * Home services: payment, cancellation and reschedule rules.
 *
 * Every number here is a default. The live values are edited by the ZARVA team in admin
 * (Settings → Cancellation rules) and sent to the apps with the catalogue, so the refund a
 * customer is shown before confirming is the refund the API pays.
 *
 * Money is integer paise. Service prices include GST at 18%.
 */

/** GST on home services. Prices on ZARVA include it. */
export const HOME_GST_BPS = 1800;

export interface HomeRefundSlab {
  /** Applies when the cancellation is at least this many minutes before the slot. */
  minMinutesBefore: number;
  /** Share of the base price (and of its GST) given back. 10000 = 100%. */
  refundBps: number;
}
export interface HomePenaltyTier {
  /** Applies when the partner cancels at least this many jobs in one day. */
  fromCount: number;
  /** Share of that day's earnings deducted. 1000 = 10%. */
  penaltyBps: number;
}

export interface HomePolicy {
  /** Customers can't cancel or reschedule a paid booking less than this long before the slot. */
  customerCutoffMinutes: number;
  /** Longest notice first. A cancellation earlier than every slab is impossible (bookings are at most 7 days ahead). */
  refundSlabs: HomeRefundSlab[];
  /** Free reschedules per booking. */
  maxReschedules: number;
  /** Partner cancellations per day (India time) with no penalty. */
  partnerFreeCancelsPerDay: number;
  /** Partner cancellations per week (Monday to Sunday, India time). After this the partner app blocks cancelling. */
  partnerMaxCancelsPerWeek: number;
  /** Penalty on the day's earnings once a partner passes the free daily cancellations. Highest matching tier wins. */
  partnerPenaltyTiers: HomePenaltyTier[];
}

export const DEFAULT_HOME_POLICY: HomePolicy = {
  customerCutoffMinutes: 90,
  refundSlabs: [
    { minMinutesBefore: 24 * 60, refundBps: 10_000 },
    { minMinutesBefore: 6 * 60, refundBps: 7_500 },
    { minMinutesBefore: 3 * 60, refundBps: 5_000 },
    { minMinutesBefore: 90, refundBps: 2_500 },
  ],
  maxReschedules: 2,
  partnerFreeCancelsPerDay: 2,
  partnerMaxCancelsPerWeek: 14,
  partnerPenaltyTiers: [
    { fromCount: 3, penaltyBps: 1_000 },
    { fromCount: 4, penaltyBps: 1_250 },
    { fromCount: 5, penaltyBps: 1_500 },
  ],
};

const bps = z.number().int().min(0).max(10_000);
export const homePolicySchema = z
  .object({
    customerCutoffMinutes: z.number().int().min(0).max(24 * 60),
    refundSlabs: z.array(z.object({ minMinutesBefore: z.number().int().min(0).max(14 * 24 * 60), refundBps: bps })).min(1).max(8),
    maxReschedules: z.number().int().min(0).max(10),
    partnerFreeCancelsPerDay: z.number().int().min(0).max(20),
    partnerMaxCancelsPerWeek: z.number().int().min(1).max(100),
    partnerPenaltyTiers: z.array(z.object({ fromCount: z.number().int().min(1).max(50), penaltyBps: bps })).max(8),
  })
  .refine((p) => p.refundSlabs.every((s) => s.minMinutesBefore >= p.customerCutoffMinutes), "Every refund slab must start at or after the cancellation cut-off")
  .refine((p) => p.partnerPenaltyTiers.every((t) => t.fromCount > p.partnerFreeCancelsPerDay), "Penalty tiers must start after the free daily cancellations")
  .transform((p) => ({
    ...p,
    refundSlabs: [...p.refundSlabs].sort((a, b) => b.minMinutesBefore - a.minMinutesBefore),
    partnerPenaltyTiers: [...p.partnerPenaltyTiers].sort((a, b) => a.fromCount - b.fromCount),
  }));
export type HomePolicyInput = z.input<typeof homePolicySchema>;

/** The base price (taxable value) and GST inside a GST-inclusive amount. */
export function splitGst(inclusivePaise: number): { basePaise: number; gstPaise: number } {
  const basePaise = Math.round((inclusivePaise * 10_000) / (10_000 + HOME_GST_BPS));
  return { basePaise, gstPaise: inclusivePaise - basePaise };
}

export function refundBpsFor(policy: HomePolicy, minutesBefore: number): number {
  const slab = policy.refundSlabs.find((s) => minutesBefore >= s.minMinutesBefore);
  return slab?.refundBps ?? 0;
}

/** What a customer gets back if they cancel now. Shown before they confirm. */
export interface HomeRefundQuote {
  /** Share of the base price refunded. */
  refundBps: number;
  basePaise: number;
  gstPaise: number;
  baseRefundPaise: number;
  gstRefundPaise: number;
  /** Convenience (platform / service) fee: never refunded. */
  feeKeptPaise: number;
  /** Total back to the customer. */
  refundPaise: number;
  /** What ZARVA keeps: base and GST not refunded, plus the fee. */
  chargePaise: number;
}

/** Customer cancellation. Platform and service fees are never refunded; base price and its GST by the slab. */
export function homeRefundQuote(
  b: { subtotalPaise: number; feePaise: number; totalPaise: number },
  minutesBefore: number,
  policy: HomePolicy,
): HomeRefundQuote {
  const refundBps = refundBpsFor(policy, minutesBefore);
  const { basePaise, gstPaise } = splitGst(b.subtotalPaise);
  const baseRefundPaise = Math.floor((basePaise * refundBps) / 10_000);
  const gstRefundPaise = Math.floor((gstPaise * refundBps) / 10_000);
  const refundPaise = baseRefundPaise + gstRefundPaise;
  return { refundBps, basePaise, gstPaise, baseRefundPaise, gstRefundPaise, feeKeptPaise: b.feePaise, refundPaise, chargePaise: b.totalPaise - refundPaise };
}

/** Penalty share for a partner who cancelled `count` jobs in one day. 0 = no penalty. */
export function partnerPenaltyBps(policy: HomePolicy, count: number): number {
  if (count <= policy.partnerFreeCancelsPerDay) return 0;
  let out = 0;
  for (const t of policy.partnerPenaltyTiers) if (count >= t.fromCount) out = t.penaltyBps;
  // Past the free cancellations there is always a penalty: the lowest tier if none is reached yet.
  return out || (policy.partnerPenaltyTiers[0]?.penaltyBps ?? 0);
}

/** Why a customer can't cancel / reschedule (null = they can). Shown in the app under the disabled button. */
export type HomeChangeBlock = "too_late" | "not_changeable" | "reschedule_limit";

/** Attached to the customer's view of a booking. */
export interface HomeCancelInfo {
  canCancel: boolean;
  canReschedule: boolean;
  /** Why cancel is off. */
  cancelBlock: HomeChangeBlock | null;
  rescheduleBlock: HomeChangeBlock | null;
  /** The last moment cancel / reschedule is allowed. */
  changeDeadline: string;
  /** Refund if cancelled right now. null when nothing was paid. */
  quote: HomeRefundQuote | null;
  reschedulesLeft: number;
}

/** Partner's cancellation counts and what the next cancellation would cost. */
export interface HomePartnerCancelStats {
  today: number;
  week: number;
  freePerDay: number;
  maxPerWeek: number;
  /** Penalty already due on today's earnings (0 = none yet). */
  todayPenaltyBps: number;
  /** Penalty that one more cancellation today would bring. */
  nextPenaltyBps: number;
  canCancel: boolean;
}

/** Recorded on the booking when it is cancelled, so the bill and support can explain the refund. */
export interface HomeCancellation {
  by: "customer" | "admin" | "system";
  at: string;
  minutesBefore: number;
  quote: HomeRefundQuote;
}

export function formatBps(bps: number): string {
  const p = bps / 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

/** "24 hours", "90 minutes", "6 hours". */
export function formatNotice(min: number): string {
  if (min < 60 || min % 60 !== 0) return `${min} minutes`;
  const h = min / 60;
  return h === 1 ? "1 hour" : `${h} hours`;
}

/** Refund slabs as lines a customer can read: "24 hours or more before: 100% back". */
export function refundSlabLines(policy: HomePolicy): string[] {
  return policy.refundSlabs.map((s, i) => {
    const upper = i > 0 ? policy.refundSlabs[i - 1]!.minMinutesBefore : null;
    const when = upper === null ? `${formatNotice(s.minMinutesBefore)} or more before` : `${formatNotice(s.minMinutesBefore)} to ${formatNotice(upper)} before`;
    return `${when}: ${formatBps(s.refundBps)} of the service price back`;
  });
}

export const homeChangeBlockText: Record<HomeChangeBlock, (p: HomePolicy) => string> = {
  too_late: (p) => `Changes close ${formatNotice(p.customerCutoffMinutes)} before your slot, because your professional is already on the way or preparing. Need help? Raise a ticket in Help.`,
  not_changeable: () => "This booking can't be changed any more.",
  reschedule_limit: (p) => `You have already rescheduled this booking ${p.maxReschedules} times, the most allowed. You can still cancel it.`,
};

export const homeRescheduleSchema = z.object({ slotStart: z.string().datetime({ offset: true }) });
export const homeCancelSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  /** The refund the customer was shown. If the slab changed meanwhile the API refuses with quote_changed. */
  expectedRefundPaise: z.number().int().min(0).optional(),
});
export const homeProCancelSchema = z.object({ reason: z.string().trim().min(3).max(200) });
