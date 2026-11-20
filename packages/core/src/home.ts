import { z } from "zod";

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
  /** Free cancellation until this long before the slot. */
  freeCancelMinutes: 120,
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

export type HomePayMode = "online" | "after_service";
export type HomeProStatus = "pending" | "active" | "suspended";

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
  pro: { name: string; phone?: string } | null;
  customerNote: string | null;
  canCancel: boolean;
  events: HomeBookingEvent[];
  createdAt: string;
}
export interface HomePro {
  id: string; userId: string; name: string; phone: string; cityId: string; categoryIds: string[];
  status: HomeProStatus; locality: string | null; jobsDone: number;
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
  payMode: z.enum(["online", "after_service"]),
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
});
export type HomeProApply = z.infer<typeof homeProApplySchema>;

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
