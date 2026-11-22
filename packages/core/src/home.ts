import { z } from "zod";
import type { HomeCancelInfo, HomeCancellation, HomePartnerCancelStats } from "./home-policy";

/**
 * Home services (vertical id "home"): shared types, pricing and slot rules.
 * The API, web and mobile all import these so the total a customer sees is the total charged.
 * All money is integer paise. All slot times are India Standard Time (UTC+05:30, no DST).
 */

export const HOME_RULES = {
  /** Orders below this pay a convenience fee. */
  freeFeeAbovePaise: 29900,
  convenienceFeePaise: 2900,
  minOrderPaise: 9900,
  /** Slot start hours in IST: 08:00 ... 19:00. Each slot is a 1-hour arrival window. */
  firstSlotHour: 8,
  lastSlotHour: 19,
  /** Earliest bookable slot is at least this far from now. */
  leadTimeMinutes: 120,
  bookingWindowDays: 7,
  /** An unpaid online booking holds its slot this long, then frees it. */
  paymentHoldMinutes: 15,
  maxItemsPerBooking: 10,
  maxQtyPerItem: 5,
} as const;

const IST_OFFSET_MIN = 330;

export const homeBookingStatuses = [
  "pending_payment", "confirmed", "assigned", "on_the_way", "in_progress", "completed", "cancelled",
] as const;
export type HomeBookingStatus = (typeof homeBookingStatuses)[number];

export const homeStatusLabel: Record<HomeBookingStatus, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Booked, finding a professional",
  assigned: "Professional assigned",
  on_the_way: "Professional on the way",
  in_progress: "Work in progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Which status a professional may move a job to next. Start needs the customer's code. */
export const proNextStatus: Partial<Record<HomeBookingStatus, HomeBookingStatus>> = {
  assigned: "on_the_way",
  on_the_way: "in_progress",
  in_progress: "completed",
};

/**
 * "online" is the only way to book: every booking is paid in full up front.
 * "after_service" (cash to the professional) is switched off; it stays only for bookings made before.
 */
export type HomePayMode = "online" | "after_service";
/** draft: filling in the sign-up. pending: submitted, waiting for admin. rejected: admin asked for fixes. */
export type HomeProStatus = "draft" | "pending" | "active" | "rejected" | "suspended";
export const homeProStatuses: HomeProStatus[] = ["draft", "pending", "active", "rejected", "suspended"];

export interface HomeCity { id: string; name: string; state: string; active: boolean }
export interface HomeCategory { id: string; slug: string; name: string; icon: string; description: string; serviceCount: number }
export interface HomeService {
  id: string; categoryId: string; slug: string; name: string; description: string;
  pricePaise: number; durationMin: number; inclusions: string[]; active: boolean;
}
export interface HomeSlot { start: string; label: string; available: boolean }
export interface HomeSlotDay { date: string; label: string; slots: HomeSlot[] }

export interface HomeBookingItem { serviceId: string; name: string; unitPricePaise: number; qty: number }
export interface HomeBookingEvent { status: HomeBookingStatus; note: string | null; at: string }
export interface HomeAddressSnapshot { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; pincode: string }
export interface HomeBooking {
  id: string;
  code: string;
  status: HomeBookingStatus;
  statusLabel: string;
  cityId: string;
  categoryId: string;
  categoryName: string;
  slotStart: string;
  address: HomeAddressSnapshot;
  items: HomeBookingItem[];
  subtotalPaise: number;
  feePaise: number;
  totalPaise: number;
  payMode: HomePayMode;
  paymentId: string | null;
  paid: boolean;
  refundedPaise: number;
  /** Shown to the customer only. The pro enters it to start the job. */
  startCode?: string;
  pro: { name: string; phone?: string; rating?: { average: number | null; count: number } } | null;
  customerNote: string | null;
  /** Customer and admin views of a completed job. The PDF is at GET .../bookings/:id/invoice.pdf. */
  hasInvoice?: boolean;
  invoiceNumber?: string | null;
  /** Customer view of a completed job: their rating, and whether they can (still) rate or change it. */
  review?: HomeBookingReviewState;
  canCancel: boolean;
  /** Customer view: cancel / reschedule rules for this booking and the refund if cancelled now. */
  cancelInfo?: HomeCancelInfo;
  rescheduleCount: number;
  /** Set once cancelled: who, when, and how the refund was worked out. */
  cancellation: HomeCancellation | null;
  events: HomeBookingEvent[];
  createdAt: string;
}
/** KYC documents a professional uploads. id_front and selfie are required; the rest are optional. */
export const homeProDocKinds = ["id_front", "id_back", "selfie", "certificate"] as const;
export type HomeProDocKind = (typeof homeProDocKinds)[number];
export const homeProRequiredDocs: HomeProDocKind[] = ["id_front", "selfie"];
export const homeProDocLabel: Record<HomeProDocKind, string> = {
  id_front: "ID proof (front)",
  id_back: "ID proof (back)",
  selfie: "Your photo (selfie)",
  certificate: "Skill certificate (optional)",
};
export const homeProIdTypes = ["aadhaar_masked", "pan", "voter_id", "driving_licence"] as const;
export type HomeProIdType = (typeof homeProIdTypes)[number];
export const homeProIdTypeLabel: Record<HomeProIdType, string> = {
  aadhaar_masked: "Masked Aadhaar (from UIDAI site)",
  pan: "PAN card",
  voter_id: "Voter ID",
  driving_licence: "Driving licence",
};
export const HOME_DOC_RULES = { maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "application/pdf"] } as const;

export interface HomeProDocument { kind: HomeProDocKind; mime: string; sizeBytes: number; uploadedAt: string }
/** Payout details as shown back: account numbers are masked. */
export interface HomeProPayoutInfo { upi: string | null; bankAccountMasked: string | null; ifsc: string | null; accountName: string | null }

export interface HomePro {
  id: string; userId: string; name: string; phone: string; cityId: string; categoryIds: string[];
  status: HomeProStatus; locality: string | null; jobsDone: number;
  experienceYears: number | null;
  idType: HomeProIdType | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  documents: HomeProDocument[];
  payout: HomeProPayoutInfo;
  /** What is still missing before the pro can submit for review. Empty = ready. */
  missing: string[];
}

// ---------- Earnings and payouts ----------

/**
 * Pro ledger. Positive = ZARVA owes the pro, negative = the pro owes ZARVA. Balance = sum.
 *  job_earning      +(job price - commission), on completion
 *  cash_collected   -(total), when the pro collected cash for a pay-after-service job
 *  payout           -(amount), when ZARVA sends money to the pro
 *  payout_reversal  +(amount), when a payout failed and the money is back with ZARVA
 *  adjustment       +/- by an admin, with a note (bonus, penalty, cash dues received)
 *  cancellation_penalty  -(share of a day's earnings), when the pro cancelled more jobs that day than allowed
 */
export const homeLedgerKinds = ["job_earning", "cash_collected", "payout", "payout_reversal", "adjustment", "cancellation_penalty"] as const;
export type HomeLedgerKind = (typeof homeLedgerKinds)[number];
export const homeLedgerLabel: Record<HomeLedgerKind, string> = {
  job_earning: "Job earning",
  cash_collected: "Cash you collected",
  payout: "Paid to you",
  payout_reversal: "Payout failed, returned",
  adjustment: "Adjustment",
  cancellation_penalty: "Cancellation penalty",
};
export interface HomeLedgerEntry {
  id: string; kind: HomeLedgerKind; amountPaise: number; bookingCode: string | null; payoutId: string | null;
  grossPaise: number | null; commissionPaise: number | null; note: string | null; at: string;
}
export type HomePayoutStatus = "processing" | "manual" | "paid" | "failed";
export interface HomePayout {
  id: string; proId: string; proName: string; amountPaise: number; status: HomePayoutStatus; provider: string;
  destination: string; utr: string | null; failureReason: string | null; note: string | null; createdAt: string; paidAt: string | null;
}
export interface HomeEarnings {
  balancePaise: number;
  /** Earned (after commission) in the last 7 days. */
  weekPaise: number;
  jobsThisWeek: number;
  /** Cancellation penalties in the last 7 days (positive number, already taken off the balance). */
  penaltiesWeekPaise: number;
  cancelStats: HomePartnerCancelStats;
  entries: HomeLedgerEntry[];
  payouts: HomePayout[];
}
export interface HomeProBalance {
  proId: string; name: string; phone: string; status: HomeProStatus; balancePaise: number;
  payoutReady: boolean; destination: string | null; lastPayoutAt: string | null;
}
export interface HomeAdminCategory { id: string; slug: string; name: string; icon: string; commissionBps: number }

/** Commission on the job price (before the convenience fee, which is ZARVA's). bps: 2000 = 20%. */
export function homeCommission(subtotalPaise: number, commissionBps: number): number {
  return Math.round((subtotalPaise * commissionBps) / 10_000);
}

export const homeCartItemSchema = z.object({
  serviceId: z.string().uuid(),
  qty: z.number().int().min(1).max(HOME_RULES.maxQtyPerItem),
});

export const homeCreateBookingSchema = z.object({
  cityId: z.string().min(2).max(40),
  addressId: z.string().uuid(),
  slotStart: z.string().datetime({ offset: true }),
  items: z.array(homeCartItemSchema).min(1).max(HOME_RULES.maxItemsPerBooking),
  /** Prepaid only. "after_service" is refused with prepaid_only (older app versions may still send it). */
  payMode: z.enum(["online", "after_service"]).default("online"),
  note: z.string().trim().max(300).optional(),
  /** Same key returns the same booking, so a double-tap never books twice. */
  idempotencyKey: z.string().min(8).max(80),
});
export type HomeCreateBooking = z.infer<typeof homeCreateBookingSchema>;

export const homeProApplySchema = z.object({
  name: z.string().trim().min(2).max(80),
  cityId: z.string().min(2).max(40),
  categoryIds: z.array(z.string().uuid()).min(1).max(8),
  locality: z.string().trim().max(80).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  idType: z.enum(homeProIdTypes).optional(),
});
export type HomeProApply = z.infer<typeof homeProApplySchema>;
export const homeProUpdateSchema = homeProApplySchema.omit({ cityId: true }).partial();
export type HomeProUpdate = z.infer<typeof homeProUpdateSchema>;

export const upiSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/, "Enter a valid UPI ID, e.g. name@okaxis");
export const ifscSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC is 11 characters, e.g. SBIN0001234");
export const homeProPayoutSchema = z
  .object({
    accountName: z.string().trim().min(2).max(80),
    upi: upiSchema.optional(),
    bankAccount: z.string().trim().regex(/^\d{9,18}$/, "Account number is 9 to 18 digits").optional(),
    ifsc: ifscSchema.optional(),
  })
  .refine((p) => p.upi || p.bankAccount, "Add a UPI ID or a bank account")
  .refine((p) => !p.bankAccount === !p.ifsc, "Bank account needs its IFSC code");
export type HomeProPayoutInput = z.infer<typeof homeProPayoutSchema>;

export const homeDocUploadSchema = z.object({
  mime: z.enum(HOME_DOC_RULES.mimes),
  /** File bytes, base64. The web app shrinks photos to about 1600 px first. */
  dataBase64: z.string().min(16).max(Math.ceil((HOME_DOC_RULES.maxBytes * 4) / 3) + 8),
});

export function homeTotals(lines: { unitPricePaise: number; qty: number }[]) {
  const subtotalPaise = lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);
  const feePaise = subtotalPaise > 0 && subtotalPaise < HOME_RULES.freeFeeAbovePaise ? HOME_RULES.convenienceFeePaise : 0;
  return { subtotalPaise, feePaise, totalPaise: subtotalPaise + feePaise };
}

/** 49900 -> "₹499", 49950 -> "₹499.50" */
export function formatRupees(paise: number): string {
  const r = paise / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** IST calendar date "YYYY-MM-DD" for an instant. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Instant for an IST wall-clock hour on an IST date. */
export function istInstant(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour, 0) - IST_OFFSET_MIN * 60_000);
}

/** IST hour (0-23) and minute of an instant. */
export function istHourMinute(d: Date): { hour: number; minute: number } {
  const s = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { hour: s.getUTCHours(), minute: s.getUTCMinutes() };
}

export function formatSlot(startIso: string): string {
  const { hour } = istHourMinute(new Date(startIso));
  const f = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? " AM" : " PM"}`;
  return `${f(hour)} – ${f(hour + 1)}`;
}

export function formatDay(date: string, today: string): string {
  const d = istInstant(date, 12);
  const tomorrow = istDate(new Date(istInstant(today, 12).getTime() + 86_400_000));
  const base = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return date === today ? `Today, ${base}` : date === tomorrow ? `Tomorrow, ${base}` : base;
}

/** True if this instant is a valid slot start (on the hour, inside working hours). */
export function isSlotStart(d: Date): boolean {
  const { hour, minute } = istHourMinute(d);
  return d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 && minute === 0 && hour >= HOME_RULES.firstSlotHour && hour <= HOME_RULES.lastSlotHour;
}

/** Every slot start that is bookable from `now` on (ignores capacity). */
export function bookableSlotStarts(now: Date): Date[] {
  const earliest = now.getTime() + HOME_RULES.leadTimeMinutes * 60_000;
  const today = istDate(now);
  const out: Date[] = [];
  for (let day = 0; day < HOME_RULES.bookingWindowDays; day++) {
    const date = istDate(new Date(istInstant(today, 12).getTime() + day * 86_400_000));
    for (let h = HOME_RULES.firstSlotHour; h <= HOME_RULES.lastSlotHour; h++) {
      const s = istInstant(date, h);
      if (s.getTime() >= earliest) out.push(s);
    }
  }
  return out;
}

/** Human-friendly booking reference, e.g. "ZH-7K3QF2". Not a secret; the uuid is the real id. */
export function bookingCode(uuid: string): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let n = BigInt(`0x${uuid.replace(/-/g, "").slice(0, 12)}`);
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Number(n % 32n)];
    n /= 32n;
  }
  return `ZH-${s}`;
}

// ---------- Ratings and reviews ----------

export const HOME_REVIEW_RULES = {
  /** A customer can rate a completed job for this long after it finished. */
  windowDays: 30,
  /** ...and change their rating for this long after first posting it. */
  editDays: 7,
  maxComment: 500,
} as const;

/** Quick tags a customer can tick. Positive ones show for 4-5 stars, the rest for 1-3. */
export const homeReviewTags = [
  "on_time", "polite", "skilled", "clean_work", "good_value",
  "late", "rude", "poor_work", "left_mess", "overcharged",
] as const;
export type HomeReviewTag = (typeof homeReviewTags)[number];
export const homeReviewTagLabel: Record<HomeReviewTag, string> = {
  on_time: "On time", polite: "Polite", skilled: "Knew the job", clean_work: "Left it clean", good_value: "Good value",
  late: "Came late", rude: "Rude", poor_work: "Work not done well", left_mess: "Left a mess", overcharged: "Asked for extra money",
};
export const homeReviewGoodTags: HomeReviewTag[] = ["on_time", "polite", "skilled", "clean_work", "good_value"];
export const homeReviewBadTags: HomeReviewTag[] = ["late", "rude", "poor_work", "left_mess", "overcharged"];

export const homeReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(HOME_REVIEW_RULES.maxComment).optional(),
  tags: z.array(z.enum(homeReviewTags)).max(5).default([]),
});
export type HomeReviewInput = z.infer<typeof homeReviewSchema>;

/** A review as the public sees it: first name and last initial only, never a phone number. */
export interface HomeReview {
  id: string;
  rating: number;
  comment: string | null;
  tags: HomeReviewTag[];
  customerName: string;
  categoryName: string;
  categorySlug: string;
  proName: string | null;
  /** Services in the job, e.g. "Fan repair". */
  serviceNames: string;
  createdAt: string;
  /** Admin only. Hidden reviews still count toward nothing and show nowhere. */
  hidden?: boolean;
  hiddenReason?: string | null;
  bookingCode?: string;
}
export interface HomeRatingSummary {
  /** Average of published reviews, one decimal. null when there are none yet. */
  average: number | null;
  count: number;
  /** Count per star, index 0 = 1 star ... index 4 = 5 stars. */
  stars: [number, number, number, number, number];
}
/** What the customer sees on a completed booking. */
export interface HomeBookingReviewState {
  review: HomeReview | null;
  canReview: boolean;
  canEdit: boolean;
}

/** "Riya Sen" -> "Riya S.", empty -> "ZARVA customer". */
export function reviewerName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ZARVA customer";
  const first = parts[0]!.slice(0, 20);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : first;
}

export function emptyRatingSummary(): HomeRatingSummary {
  return { average: null, count: 0, stars: [0, 0, 0, 0, 0] };
}

// ---------- Invoices ----------

/** Invoice number, e.g. "ZH/26-27/000042". Sequential per Indian financial year (April-March), as GST requires. */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
export function invoiceNumber(fy: string, seq: number): string {
  return `ZH/${fy}/${String(seq).padStart(6, "0")}`;
}
