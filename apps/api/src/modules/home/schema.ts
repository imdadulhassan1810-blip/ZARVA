import { sql } from "drizzle-orm";
import {
  bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
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
export const homeProStatusEnum = pgEnum("home_pro_status", ["pending", "active", "suspended"]);

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
    ...timestamps,
  },
  (t) => [index("home_pros_city_idx").on(t.cityId, t.status)],
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
