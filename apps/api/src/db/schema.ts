import { sql } from "drizzle-orm";
import {
  bigserial, boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const languageEnum = pgEnum("language", ["en", "hi", "bn"]);
export const userStatusEnum = pgEnum("user_status", ["active", "blocked", "deleted"]);
/**
 * Which app a session was opened in. One person (one users row) can be a customer and a partner,
 * like an Uber rider who also drives, but each sign-in only opens the app it was made in.
 */
export const sessionPortalEnum = pgEnum("session_portal", ["customer", "partner"]);
export const adminStatusEnum = pgEnum("admin_status", ["active", "disabled"]);
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
  /** Apple account id ("sub" claim from Sign in with Apple). Stable even if they hide or change their email. */
  appleSub: text("apple_sub").unique(),
  preferredLanguage: languageEnum("preferred_language").notNull().default("en"),
  /** Opted in to WhatsApp updates (Meta requires opt-in for business-started messages). */
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
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
  (t) => [index("otp_phone_created_idx").on(t.phone, t.createdAt), index("otp_email_created_idx").on(t.email, t.createdAt), index("otp_ip_created_idx").on(t.ip, t.createdAt), index("otp_created_idx").on(t.createdAt)],
);

/** One row per logged-in device. The refresh token is stored only as a SHA-256 hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    portal: sessionPortalEnum("portal").notNull().default("customer"),
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

export const notifyChannelEnum = pgEnum("notify_channel", ["sms", "whatsapp"]);
export const notifyStatusEnum = pgEnum("notify_status", ["queued", "sent", "failed", "skipped"]);

/**
 * Outbox for SMS / WhatsApp. Rows are written in the same transaction as the change they announce
 * (a booking confirmed, a pro assigned...), then a background loop sends them and retries failures.
 * So a message is never sent for a change that rolled back, and never lost when the provider is down.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notifyChannelEnum("channel").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** E.164. */
    toPhone: text("to_phone").notNull(),
    event: text("event").notNull(),
    vars: jsonb("vars").notNull(),
    /** Rendered text, for the log and console sender. Providers send the registered template. */
    body: text("body").notNull(),
    /** Same key = same message. Stops duplicates when a webhook and the app both confirm a booking. */
    dedupeKey: text("dedupe_key").notNull(),
    status: notifyStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey, t.channel),
    index("notifications_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

// Vertical modules own their tables (prefixed <id>_) but share one schema for migrations and typed queries.
export const supportStatusEnum = pgEnum("support_status", ["open", "waiting_customer", "resolved"]);

/**
 * Customer support. Platform-wide: module + referenceId optionally point at a booking in a vertical
 * (checked by that module when the ticket is created). Customers see only their own tickets.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Small running number for the "ZT-1042" code customers quote. */
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    subject: text("subject").notNull(),
    status: supportStatusEnum("status").notNull().default("open"),
    module: text("module"),
    referenceId: text("reference_id"),
    /** Copy of what the reference was, e.g. "Booking ZH-7K3QF2 · Electrician". */
    referenceLabel: text("reference_label"),
    /** admin_accounts.id who resolved it. */
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId, t.createdAt),
    index("support_tickets_status_idx").on(t.status, t.updatedAt),
    index("support_tickets_ref_idx").on(t.module, t.referenceId),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
    /** Exactly one of userId / adminId is set. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    adminId: uuid("admin_id").references(() => adminAccounts.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId, t.seq)],
);

/** "Send feedback" about ZARVA itself (not one booking). Read by the team in the admin app. */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    rating: integer("rating"),
    message: text("message").notNull(),
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feedback_created_idx").on(t.createdAt), index("feedback_user_idx").on(t.userId, t.createdAt)],
);

export * from "../modules/home/schema";

/**
 * ZARVA team accounts. Separate from customers and partners on purpose: issued by ZARVA (an
 * existing admin or `pnpm admin:create`), never self sign-up, never a personal phone OTP.
 * Sign-in = username + password + 6-digit authenticator code.
 */
export const adminAccounts = pgTable("admin_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lower-case, 3-32 of a-z 0-9 . _ - */
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  /** scrypt, see admin/passwords.ts */
  passwordHash: text("password_hash").notNull(),
  /** Authenticator secret, encrypted with the vault key. Null only for the local demo admin. */
  totpSecretEnc: text("totp_secret_enc"),
  /** Last accepted time step: the same 6-digit code can't be used twice. */
  lastTotpStep: integer("last_totp_step"),
  status: adminStatusEnum("status").notNull().default("active"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  ...timestamps,
});

/** Admin sign-ins. Shorter-lived than customer sessions (12 hours), and revoked when an admin is disabled. */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").notNull().references(() => adminAccounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_sessions_admin_idx").on(t.adminId)],
);
