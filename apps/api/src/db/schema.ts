import { sql } from "drizzle-orm";
import {
  boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const languageEnum = pgEnum("language", ["en", "hi", "bn"]);
export const userStatusEnum = pgEnum("user_status", ["active", "blocked", "deleted"]);
export const addressLabelEnum = pgEnum("address_label", ["home", "work", "other"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "created", "authorized", "captured", "failed", "refunded", "partially_refunded",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * E.164, e.g. +919876543210. Only ever set after the number is verified by OTP.
   * Null for people who signed up with Google or email and have not added a phone yet;
   * a verified phone is required before any booking or payment.
   */
  phone: text("phone").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  name: text("name"),
  /** Lower-case. Only ever set after the address is verified (email code or Google). */
  email: text("email").unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /** Google account id ("sub" claim). Stable even if the person changes their Gmail address. */
  googleSub: text("google_sub").unique(),
  preferredLanguage: languageEnum("preferred_language").notNull().default("en"),
  status: userStatusEnum("status").notNull().default("active"),
  ...timestamps,
});

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Exactly one of phone / email is set: where the code was sent. */
    phone: text("phone"),
    email: text("email"),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_phone_created_idx").on(t.phone, t.createdAt), index("otp_email_created_idx").on(t.email, t.createdAt)],
);

/** One row per logged-in device. The refresh token is stored only as a SHA-256 hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    deviceName: text("device_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: addressLabelEnum("label").notNull().default("home"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isDefault: boolean("is_default").notNull().default(false),
    /** Soft delete: orders in any vertical may still point at an old address. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("addresses_user_idx").on(t.userId),
    uniqueIndex("addresses_one_default_per_user").on(t.userId).where(sql`${t.isDefault} and ${t.deletedAt} is null`),
  ],
);

/**
 * Platform-wide payments. A vertical creates a payment for its own order via PaymentService;
 * `module` + `referenceId` point back to that order. Amounts are integer paise.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    module: text("module").notNull(),
    referenceId: text("reference_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatusEnum("status").notNull().default("created"),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id"),
    method: text("method"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("payments_ref_idx").on(t.module, t.referenceId),
  ],
);

/** Every webhook we accept, deduped by provider event id. Audit trail for disputes. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_dedupe_idx").on(t.provider, t.eventId)],
);

// Vertical modules own their tables (prefixed <id>_) but share one schema for migrations and typed queries.
export * from "../modules/home/schema";

/**
 * Admin second factor. A session must be unlocked with an authenticator code before admin APIs
 * answer. Rows die with the session (logout, refresh-token reuse) and expire after a few hours.
 */
export const adminUnlocks = pgTable("admin_unlocks", {
  sessionId: uuid("session_id").primaryKey().references(() => sessions.id, { onDelete: "cascade" }),
  unlockedUntil: timestamp("unlocked_until", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** Last accepted TOTP time step: the same code can't be used twice. */
  lastStep: integer("last_step"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
