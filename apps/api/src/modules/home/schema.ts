import { sql } from "drizzle-orm";
import {
  bigserial, boolean, check, customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { addresses, payments, users } from "../../db/schema";

/** Home services vertical. Every table is prefixed home_ and only this module writes to it. */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const homeBookingStatusEnum = pgEnum("home_booking_status", [
  "pending_payment", "confirmed", "assigned", "on_the_way", "in_progress", "completed", "cancelled",
]);
export const homePayModeEnum = pgEnum("home_pay_mode", ["online", "after_service"]);
// draft/rejected were added later; Postgres appends enum values, so the order here matches the database.
export const homeProStatusEnum = pgEnum("home_pro_status", ["pending", "active", "suspended", "draft", "rejected"]);
export const homeLedgerKindEnum = pgEnum("home_ledger_kind", ["job_earning", "cash_collected", "payout", "payout_reversal", "adjustment", "cancellation_penalty"]);
export const homePayoutStatusEnum = pgEnum("home_payout_status", ["processing", "manual", "paid", "failed"]);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

/** A city we serve (or will). Serviceability is decided by PIN code. */
export const homeCities = pgTable("home_cities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  active: boolean("active").notNull().default(false),
  pincodes: text("pincodes").array().notNull().default(sql`'{}'::text[]`),
  sort: integer("sort").notNull().default(0),
});

export const homeCategories = pgTable("home_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  description: text("description").notNull(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** ZARVA's commission on the job price, in basis points (2000 = 20%). Edited in admin. */
  commissionBps: integer("commission_bps").notNull().default(2000),
});

export const homeServices = pgTable(
  "home_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => homeCategories.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Price incl. GST, integer paise. */
    pricePaise: integer("price_paise").notNull(),
    durationMin: integer("duration_min").notNull(),
    inclusions: text("inclusions").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("home_services_category_idx").on(t.categoryId)],
);

/** A service professional. One per user. Admin approves before they see jobs. */
export const homePros = pgTable(
  "home_pros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cityId: text("city_id").notNull().references(() => homeCities.id),
    categoryIds: uuid("category_ids").array().notNull(),
    locality: text("locality"),
    status: homeProStatusEnum("status").notNull().default("pending"),
    experienceYears: integer("experience_years"),
    idType: text("id_type"),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** admin_accounts.id of the reviewer. */
    reviewedBy: uuid("reviewed_by"),
    // Where ZARVA sends this pro's money. UPI preferred; bank account as fallback.
    payoutAccountName: text("payout_account_name"),
    payoutUpi: text("payout_upi"),
    payoutBankAccount: text("payout_bank_account"),
    payoutIfsc: text("payout_ifsc"),
    ...timestamps,
  },
  (t) => [index("home_pros_city_idx").on(t.cityId, t.status)],
);

/**
 * KYC files. Stored in the database, encrypted (AES-256-GCM, KYC_ENCRYPTION_KEY), and only ever
 * served through admin APIs. One file per kind per pro; uploading again replaces it.
 */
export const homeProDocuments = pgTable(
  "home_pro_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id").notNull().references(() => homePros.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** iv (12 bytes) + auth tag (16 bytes) + ciphertext. */
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("home_pro_documents_kind_idx").on(t.proId, t.kind)],
);

export const homeBookings = pgTable(
  "home_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cityId: text("city_id").notNull().references(() => homeCities.id),
    categoryId: uuid("category_id").notNull().references(() => homeCategories.id),
    addressId: uuid("address_id").notNull().references(() => addresses.id),
    /** Copy of the address at booking time: editing the address later must not move the job. */
    address: jsonb("address").notNull(),
    slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
    status: homeBookingStatusEnum("status").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    feePaise: integer("fee_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    payMode: homePayModeEnum("pay_mode").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    paid: boolean("paid").notNull().default(false),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    proId: uuid("pro_id").references(() => homePros.id),
    /** 4 digits the customer tells the pro on arrival. Proves the pro is actually there. */
    startCode: text("start_code").notNull(),
    customerNote: text("customer_note"),
    cancelReason: text("cancel_reason"),
    /** HomeCancellation: who cancelled, how long before the slot, and the refund worked out from the rules then. */
    cancellation: jsonb("cancellation"),
    /** Free reschedules used (limit in the cancellation rules). */
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("home_bookings_idem_idx").on(t.userId, t.idempotencyKey),
    index("home_bookings_slot_idx").on(t.cityId, t.categoryId, t.slotStart),
    index("home_bookings_user_idx").on(t.userId, t.createdAt),
    index("home_bookings_pro_idx").on(t.proId),
    // A professional cannot hold two live jobs in the same slot.
    uniqueIndex("home_bookings_pro_slot_idx")
      .on(t.proId, t.slotStart)
      .where(sql`${t.status} in ('assigned', 'on_the_way', 'in_progress')`),
  ],
);

export const homeBookingItems = pgTable(
  "home_booking_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => homeBookings.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => homeServices.id),
    /** Name and price as they were when booked. */
    name: text("name").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => [index("home_booking_items_booking_idx").on(t.bookingId)],
);

/** Status timeline shown to the customer, and the audit trail for disputes. */
export const homeBookingEvents = pgTable(
  "home_booking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Insert order. Timestamps can tie within a millisecond; the timeline must not reorder. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    bookingId: uuid("booking_id").notNull().references(() => homeBookings.id, { onDelete: "cascade" }),
    status: homeBookingStatusEnum("status").notNull(),
    actor: text("actor").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("home_booking_events_booking_idx").on(t.bookingId, t.seq)],
);

/** Money between ZARVA and each pro. Never updated or deleted: corrections are new rows. See HomeLedgerKind. */
export const homeProLedger = pgTable(
  "home_pro_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    proId: uuid("pro_id").notNull().references(() => homePros.id),
    kind: homeLedgerKindEnum("kind").notNull(),
    /** Signed paise. + ZARVA owes the pro, - the pro owes ZARVA. */
    amountPaise: integer("amount_paise").notNull(),
    bookingId: uuid("booking_id").references(() => homeBookings.id),
    payoutId: uuid("payout_id"),
    /** For job earnings: the job price and ZARVA's cut, so the pro can see how the number was made. */
    grossPaise: integer("gross_paise"),
    commissionPaise: integer("commission_paise"),
    note: text("note"),
    /** admin_accounts.id for manual adjustments; null for automatic rows. */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("home_pro_ledger_pro_idx").on(t.proId, t.seq),
    // A job is earned once, and cash for it is collected once, whatever retries happen.
    uniqueIndex("home_pro_ledger_booking_kind_idx").on(t.bookingId, t.kind).where(sql`${t.bookingId} is not null`),
    uniqueIndex("home_pro_ledger_payout_kind_idx").on(t.payoutId, t.kind).where(sql`${t.payoutId} is not null`),
  ],
);

export const homePayouts = pgTable(
  "home_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id").notNull().references(() => homePros.id),
    amountPaise: integer("amount_paise").notNull(),
    status: homePayoutStatusEnum("status").notNull(),
    provider: text("provider").notNull(),
    providerPayoutId: text("provider_payout_id").unique(),
    /** Copy of where the money went, e.g. "UPI subrata@okaxis". */
    destination: text("destination").notNull(),
    utr: text("utr"),
    failureReason: text("failure_reason"),
    note: text("note"),
    /** admin_accounts.id (or the earliest rows: the user id of a phone admin). */
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("home_payouts_pro_idx").on(t.proId, t.createdAt)],
);

/** Payout webhooks we accepted, deduped by provider event id. */
export const homePayoutEvents = pgTable(
  "home_payout_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("home_payout_events_dedupe_idx").on(t.provider, t.eventId)],
);

/**
 * One rating per completed booking, written by the customer who booked it. Never deleted:
 * admin can hide one (abuse, phone numbers in the text) and the reason is kept.
 */
export const homeReviews = pgTable(
  "home_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().unique().references(() => homeBookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    proId: uuid("pro_id").references(() => homePros.id),
    categoryId: uuid("category_id").notNull().references(() => homeCategories.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** "Riya S." at the time of writing. */
    customerName: text("customer_name").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
    hiddenBy: uuid("hidden_by"),
    ...timestamps,
  },
  (t) => [
    index("home_reviews_pro_idx").on(t.proId, t.createdAt),
    index("home_reviews_category_idx").on(t.categoryId, t.createdAt),
    index("home_reviews_created_idx").on(t.createdAt),
    check("home_reviews_rating_check", sql`${t.rating} between 1 and 5`),
  ],
);

/** Last invoice number used per financial year ("26-27"). Numbers never repeat and never skip. */
export const homeInvoiceCounters = pgTable("home_invoice_counters", {
  fy: text("fy").primaryKey(),
  last: integer("last").notNull(),
});

/**
 * Issued once, when the job is completed, and frozen: the PDF is always drawn from this row, so a
 * later price or name change never alters an invoice the customer already has.
 */
export const homeInvoices = pgTable("home_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().unique().references(() => homeBookings.id, { onDelete: "cascade" }),
  number: text("number").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  /** Everything printed on the invoice: seller, buyer, lines, tax split. See invoices.ts InvoiceData. */
  data: jsonb("data").notNull(),
});

/** Cancellation rules and other settings the ZARVA team edits in admin. One row per key, value is JSON. */
export const homeSettings = pgTable("home_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  /** admin_accounts.id */
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every time a professional drops a job they had accepted. Counted per India-time day and Monday-Sunday week. */
export const homeProCancellations = pgTable(
  "home_pro_cancellations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id").notNull().references(() => homePros.id),
    bookingId: uuid("booking_id").notNull().references(() => homeBookings.id, { onDelete: "cascade" }),
    /** IST date "YYYY-MM-DD" of the cancellation. */
    day: text("day").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("home_pro_cancellations_pro_day_idx").on(t.proId, t.day)],
);

/**
 * One row per professional per day on which they cancelled more jobs than allowed, written after the
 * day ends (India time) so the day's earnings are known. The matching ledger row takes it off the balance.
 */
export const homeProPenalties = pgTable(
  "home_pro_penalties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id").notNull().references(() => homePros.id),
    day: text("day").notNull(),
    cancellations: integer("cancellations").notNull(),
    penaltyBps: integer("penalty_bps").notNull(),
    /** That day's job earnings (after commission) the penalty is a share of. */
    dayEarningsPaise: integer("day_earnings_paise").notNull(),
    penaltyPaise: integer("penalty_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("home_pro_penalties_pro_day_idx").on(t.proId, t.day)],
);
