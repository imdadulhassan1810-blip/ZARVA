import { z } from "zod";

/**
 * Home services: pricing, cancellation and reschedule rules.
 *
 * Every number here is a default. The live values are edited by the ZARVA team in admin
 * (Settings → Cancellation rules) and sent to the apps with the catalogue, so the refund a
 * customer is shown before confirming is the refund the API pays.
 *
 * Money is integer paise. Catalogue prices are the professional's quote; the customer's price is
 * worked out from it by homeTotals.
 */

/** GST on home services: 18% on the base price plus the service and platform charges. */
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
  /** Base price the customer sees = the professional's quote plus this. 500 = the quote + 5%. */
  markupBps: number;
  /** ZARVA's commission, taken off the professional's quote. 1000 = the pro earns 90% of their quote. */
  proCommissionBps: number;
  /** Service charge on the base price. 600 = 6%. Never refunded. */
  serviceChargeBps: number;
  /** Platform and maintenance charge on the base price. 300 = 3%. Never refunded. */
  platformChargeBps: number;
  /** Service + platform charges together are at least this (before GST). 1500 = ₹15. */
  minFeePaise: number;
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
  markupBps: 500,
  proCommissionBps: 1_000,
  serviceChargeBps: 600,
  platformChargeBps: 300,
  minFeePaise: 1_500,
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
    // Defaults so an older admin page that doesn't send these still saves.
    markupBps: z.number().int().min(0).max(10_000).default(DEFAULT_HOME_POLICY.markupBps),
    proCommissionBps: z.number().int().min(0).max(5_000).default(DEFAULT_HOME_POLICY.proCommissionBps),
    serviceChargeBps: z.number().int().min(0).max(5_000).default(DEFAULT_HOME_POLICY.serviceChargeBps),
    platformChargeBps: z.number().int().min(0).max(5_000).default(DEFAULT_HOME_POLICY.platformChargeBps),
    minFeePaise: z.number().int().min(0).max(100_000).default(DEFAULT_HOME_POLICY.minFeePaise),
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

/**
 * Share of an amount, rounded to the nearest paisa (half a paisa rounds up).
 * Integer maths only, so the web, the apps and the API always get the same paisa.
 */
export function bpsOf(paise: number, bps: number): number {
  return Math.floor((paise * bps + 5_000) / 10_000);
}

/** Legacy: base and GST inside a GST-inclusive amount (bookings made before prices became pre-GST). */
export function splitGst(inclusivePaise: number): { basePaise: number; gstPaise: number } {
  const basePaise = Math.round((inclusivePaise * 10_000) / (10_000 + HOME_GST_BPS));
  return { basePaise, gstPaise: inclusivePaise - basePaise };
}

/** How a booking's total is made up. Frozen on the booking, so a later rate change never changes a past bill. */
export interface HomePriceBreakdown {
  /** The professionals' quote: sum of catalogue price x qty. */
  quotePaise: number;
  markupBps: number;
  proCommissionBps: number;
  /** ZARVA's commission on the quote. */
  proCommissionPaise: number;
  /** What the professional is paid: quote - commission. */
  proEarningPaise: number;
  /** Base price the customer sees: each item's quote plus the markup, x qty. */
  basePaise: number;
  /** Operations bucket. With platformChargePaise it is shown to customers as one "Platform & convenience fee". */
  serviceChargeBps: number;
  serviceChargePaise: number;
  /** Tech bucket. */
  platformChargeBps: number;
  platformChargePaise: number;
  /** The minimum fee in force when booked, and whether it raised the fee. */
  minFeePaise: number;
  minFeeApplied: boolean;
  gstBps: number;
  /** base + service charge + platform charge: what GST is charged on. */
  taxablePaise: number;
  /** GST on the taxable value. Split below so a refund can give back the base price's share. */
  gstPaise: number;
  /** The base price's share of the GST (refundable by the slab). */
  gstOnBasePaise: number;
  /** The charges' share of the GST (never refunded). gstOnBasePaise + gstOnChargesPaise = gstPaise. */
  gstOnChargesPaise: number;
}

export interface HomeTotals {
  /** = pricing.basePaise. Refunds are worked out on this. */
  subtotalPaise: number;
  /** Never refunded: service charge + platform charge + their share of the GST. */
  feePaise: number;
  /** What the customer pays: base + service + platform + GST. */
  totalPaise: number;
  pricing: HomePriceBreakdown;
}

type Rates = Pick<HomePolicy, "markupBps" | "proCommissionBps" | "serviceChargeBps" | "platformChargeBps" | "minFeePaise">;

/** Price of one item as the customer sees it: the professional's quote plus the markup, to the paisa. */
export function homeUnitPrice(quotePaise: number, rates: Pick<HomePolicy, "markupBps"> = DEFAULT_HOME_POLICY): number {
  return bpsOf(quotePaise, 10_000 + rates.markupBps);
}

/**
 * THE price calculation. Checkout, the booking, the bill, refunds and partner payouts all use
 * this one function (the API stores its result on the booking).
 *
 *   1. base price      = professional's quote + 5%    (per item, then x qty and summed)
 *   2. service charge  = 6% of base     } shown to the customer as one "Platform & convenience fee",
 *   3. platform charge = 3% of base     } at least ₹15 together (split 6:3 when the minimum applies)
 *   4. GST             = 18% of (1 + 2 + 3)
 *   customer pays      = 1 + 2 + 3 + 4
 *   professional earns = quote - 10% commission
 *
 * All percentages are admin-editable. Each amount is rounded to the nearest paisa on its own
 * (half a paisa rounds up), the charges and GST on the whole order, and the total is the sum of
 * the rounded lines, so the bill always adds up exactly.
 * Examples: quote ₹100 -> base ₹105, fee ₹15 (9% would be ₹9.45), GST ₹21.60, total ₹141.60; pro earns ₹90.
 *           quote ₹199 -> base ₹208.95, fee ₹18.81 (₹12.54 + ₹6.27), GST ₹41.00, total ₹268.76.
 */
export function homeTotals(lines: { unitPricePaise: number; qty: number }[], rates: Rates = DEFAULT_HOME_POLICY): HomeTotals {
  const quotePaise = lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);
  const proCommissionPaise = bpsOf(quotePaise, rates.proCommissionBps);
  const basePaise = lines.reduce((s, l) => s + homeUnitPrice(l.unitPricePaise, rates) * l.qty, 0);
  let serviceChargePaise = bpsOf(basePaise, rates.serviceChargeBps);
  let platformChargePaise = bpsOf(basePaise, rates.platformChargeBps);
  // Minimum fee: raise the two charges to the minimum together, keeping their 6:3 split (rounded, operations first).
  const minFeeApplied = basePaise > 0 && serviceChargePaise + platformChargePaise < rates.minFeePaise;
  if (minFeeApplied) {
    const bothBps = rates.serviceChargeBps + rates.platformChargeBps;
    serviceChargePaise = bothBps > 0 ? Math.floor((rates.minFeePaise * rates.serviceChargeBps + bothBps / 2) / bothBps) : rates.minFeePaise;
    platformChargePaise = rates.minFeePaise - serviceChargePaise;
  }
  const taxablePaise = basePaise + serviceChargePaise + platformChargePaise;
  const gstPaise = bpsOf(taxablePaise, HOME_GST_BPS);
  const gstOnBasePaise = Math.min(gstPaise, bpsOf(basePaise, HOME_GST_BPS));
  const gstOnChargesPaise = gstPaise - gstOnBasePaise;
  return {
    subtotalPaise: basePaise,
    feePaise: serviceChargePaise + platformChargePaise + gstOnChargesPaise,
    totalPaise: taxablePaise + gstPaise,
    pricing: {
      quotePaise, markupBps: rates.markupBps, basePaise,
      proCommissionBps: rates.proCommissionBps, proCommissionPaise, proEarningPaise: quotePaise - proCommissionPaise,
      serviceChargeBps: rates.serviceChargeBps, serviceChargePaise,
      platformChargeBps: rates.platformChargeBps, platformChargePaise,
      minFeePaise: rates.minFeePaise, minFeeApplied,
      gstBps: HOME_GST_BPS, taxablePaise, gstPaise, gstOnBasePaise, gstOnChargesPaise,
    },
  };
}

/** Base price and its GST of a booking: from the frozen breakdown, or worked back for a legacy GST-inclusive booking. */
export function homeBaseAndGst(b: { subtotalPaise: number; pricing?: HomePriceBreakdown | null }): { basePaise: number; gstPaise: number } {
  return b.pricing ? { basePaise: b.pricing.basePaise, gstPaise: b.pricing.gstOnBasePaise } : splitGst(b.subtotalPaise);
}

export interface HomeBillLine { key: string; label: string; paise: number }

/**
 * The customer's bill, line by line, in the same words on checkout, the booking page and the invoice.
 * The service and platform charges are one line for customers; admin sees them apart. Lines add up to the total.
 */
export function homeBillLines(b: { subtotalPaise: number; feePaise: number; pricing?: HomePriceBreakdown | null }): HomeBillLine[] {
  const p = b.pricing;
  if (!p) {
    // Bookings made before 2026-11-22: GST-inclusive price plus a flat convenience fee.
    const out: HomeBillLine[] = [{ key: "items", label: "Item total (incl. GST)", paise: b.subtotalPaise }];
    if (b.feePaise > 0) out.push({ key: "fee", label: "Convenience fee", paise: b.feePaise });
    return out;
  }
  return [
    { key: "base", label: "Service price", paise: p.basePaise },
    { key: "fee", label: "Platform & convenience fee", paise: p.serviceChargePaise + p.platformChargePaise },
    { key: "gst", label: `GST ${formatBps(p.gstBps)}`, paise: p.gstPaise },
  ].filter((l) => l.paise > 0 || l.key === "base");
}

/**
 * What the professional earns on a booking, and ZARVA's share of the base price.
 * New bookings: the professional gets their quote minus the commission (both frozen on the booking);
 * ZARVA's share of the base price is the markup plus that commission.
 * Legacy bookings: the category commission comes off the item total, as before.
 */
export function homeProEarning(b: { subtotalPaise: number; pricing?: HomePriceBreakdown | null }, legacyCommissionBps: number): { grossPaise: number; commissionPaise: number; earningPaise: number } {
  if (b.pricing) return { grossPaise: b.pricing.basePaise, commissionPaise: b.pricing.basePaise - b.pricing.proEarningPaise, earningPaise: b.pricing.proEarningPaise };
  const commissionPaise = Math.round((b.subtotalPaise * legacyCommissionBps) / 10_000);
  return { grossPaise: b.subtotalPaise, commissionPaise, earningPaise: b.subtotalPaise - commissionPaise };
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
  /** Service + platform charges and their share of the GST (or a legacy convenience fee): never refunded. */
  feeKeptPaise: number;
  /** Total back to the customer. */
  refundPaise: number;
  /** What ZARVA keeps: base and GST not refunded, plus the fee. */
  chargePaise: number;
}

/**
 * Customer cancellation. Service and platform charges (and their share of the GST) are never refunded.
 * The base price and its share of the GST come back in the same share, by how early they cancel.
 * Each refunded part is rounded down to the paisa, so ZARVA never refunds more than was paid.
 */
export function homeRefundQuote(
  b: { subtotalPaise: number; feePaise: number; totalPaise: number; pricing?: HomePriceBreakdown | null },
  minutesBefore: number,
  policy: HomePolicy,
): HomeRefundQuote {
  const refundBps = refundBpsFor(policy, minutesBefore);
  const { basePaise, gstPaise } = homeBaseAndGst(b);
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
export type HomeChangeBlock = "too_late" | "not_changeable" | "reschedule_limit" | "job_started" | "pro_on_the_way";

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
  job_started: () => "The professional has started the work, so this booking can't be cancelled in the app. If something is wrong, raise a ticket in Help and our team will sort it out.",
  pro_on_the_way: () => "Your professional is already on the way, so the time can't be moved now. You can still cancel.",
};

export const homeRescheduleSchema = z.object({ slotStart: z.string().datetime({ offset: true }) });
export const homeCancelSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  /** The refund the customer was shown. If the slab changed meanwhile the API refuses with quote_changed. */
  expectedRefundPaise: z.number().int().min(0).optional(),
});
export const homeProCancelSchema = z.object({ reason: z.string().trim().min(3).max(200) });
