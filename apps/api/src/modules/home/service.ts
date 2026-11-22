import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  bookableSlotStarts, bookingCode, formatDay, formatPhone, formatRupees, formatSlot, HOME_RULES, homeChangeBlockText, homeRefundQuote,
  homeStatusLabel, homeTotals, istDate, isSlotStart, proNextStatus,
  type HomeAddressSnapshot, type HomeBooking, type HomeBookingStatus, type HomeCancelInfo, type HomeCancellation, type HomeCategory, type HomeCity,
  type HomeCreateBooking, type HomePartnerCancelStats, type HomePolicy, type HomeRefundQuote, type HomeService, type HomeSlotDay,
} from "@zarva/core";
import type { Db, Tx } from "../../db/client";
import { addresses, payments, users } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound, pgErrorCode } from "../../lib/errors";
import type { PaymentRow, PaymentService } from "../../payments/service";
import type { NotificationService } from "../../notify";
import type { CancellationService } from "./cancellations";
import type { EarningsService } from "./earnings";
import type { PolicyService } from "./policy";
import type { InvoiceService } from "./invoices";
import type { ReviewService } from "./reviews";
import {
  homeBookingEvents, homeBookingItems, homeBookings, homeCategories, homeCities, homePros, homeServices,
} from "./schema";

type BookingRow = typeof homeBookings.$inferSelect;
type ProRow = typeof homePros.$inferSelect;
type Actor = "customer" | "pro" | "admin" | "system";
/** customer: full detail + start code. pro: full address, no start code. preview: job offer, no contact details. */
type View = "customer" | "pro" | "preview" | "admin";

/** Statuses that hold a slot. Unpaid online bookings hold it only for the payment window. */
const LIVE: HomeBookingStatus[] = ["confirmed", "assigned", "on_the_way", "in_progress", "completed"];
/** A paid booking can be cancelled or moved by the customer only before the professional sets off. */
const CUSTOMER_CHANGEABLE: HomeBookingStatus[] = ["confirmed", "assigned"];
/** A professional can drop a job they accepted until they start it. */
const PRO_CANCELLABLE: HomeBookingStatus[] = ["assigned", "on_the_way"];

export class HomeServicesService {
  constructor(
    private db: Db,
    private payments: PaymentService,
    private now: () => Date,
    private notify: NotificationService,
    private earnings: EarningsService,
    private invoices: InvoiceService,
    private reviews: ReviewService,
    private policy: PolicyService,
    private cancellations: CancellationService,
    private opts: { onlinePayments: boolean } = { onlinePayments: true },
  ) {
    payments.onStatusChange("home", (p, tx) => this.onPayment(p, tx));
  }

  // ---------- Catalogue ----------

  async cities(): Promise<HomeCity[]> {
    const rows = await this.db.select().from(homeCities).orderBy(asc(homeCities.sort));
    return rows.map(({ id, name, state, active }) => ({ id, name, state, active }));
  }

  private async activeCity(cityId: string) {
    const city = await this.db.query.homeCities.findFirst({ where: eq(homeCities.id, cityId) });
    if (!city) throw notFound("City");
    if (!city.active) throw new AppError(400, "city_not_live", `${city.name} is coming soon`);
    return city;
  }

  async catalog(cityId: string): Promise<{
    city: HomeCity; categories: HomeCategory[]; services: HomeService[]; onlinePayment: boolean; prepaidOnly: true; policy: HomePolicy;
  }> {
    const city = await this.activeCity(cityId);
    const cats = await this.db.select().from(homeCategories).where(eq(homeCategories.active, true)).orderBy(asc(homeCategories.sort));
    const svcs = await this.db
      .select()
      .from(homeServices)
      .where(and(eq(homeServices.active, true), inArray(homeServices.categoryId, cats.map((c) => c.id).concat(["00000000-0000-0000-0000-000000000000"]))))
      .orderBy(asc(homeServices.sort));
    return {
      city: { id: city.id, name: city.name, state: city.state, active: city.active },
      categories: cats.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, icon: c.icon, description: c.description,
        serviceCount: svcs.filter((s) => s.categoryId === c.id).length,
      })),
      services: svcs.map(toService),
      onlinePayment: this.opts.onlinePayments,
      // Every booking is paid up front; the apps no longer offer pay after service.
      prepaidOnly: true,
      policy: await this.policy.get(),
    };
  }

  /** Professionals who can take a job in this city and category. */
  private async capacity(db: Db | Tx, cityId: string, categoryId: string): Promise<number> {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(homePros)
      .where(and(eq(homePros.cityId, cityId), eq(homePros.status, "active"), sql`${categoryId}::uuid = any(${homePros.categoryIds})`));
    return r?.n ?? 0;
  }

  private holdsSlot() {
    const holdFrom = new Date(this.now().getTime() - HOME_RULES.paymentHoldMinutes * 60_000);
    return or(
      inArray(homeBookings.status, LIVE),
      and(eq(homeBookings.status, "pending_payment"), gt(homeBookings.createdAt, holdFrom)),
    );
  }

  async slots(cityId: string, categoryId: string): Promise<HomeSlotDay[]> {
    await this.activeCity(cityId);
    const now = this.now();
    const starts = bookableSlotStarts(now);
    const cap = await this.capacity(this.db, cityId, categoryId);
    const used = await this.db
      .select({ slot: homeBookings.slotStart, n: sql<number>`count(*)::int` })
      .from(homeBookings)
      .where(and(eq(homeBookings.cityId, cityId), eq(homeBookings.categoryId, categoryId), gt(homeBookings.slotStart, now), this.holdsSlot()))
      .groupBy(homeBookings.slotStart);
    const usedBy = new Map(used.map((u) => [u.slot.getTime(), u.n]));
    const today = istDate(now);
    const days = new Map<string, HomeSlotDay>();
    for (const s of starts) {
      const date = istDate(s);
      if (!days.has(date)) days.set(date, { date, label: formatDay(date, today), slots: [] });
      const iso = s.toISOString();
      days.get(date)!.slots.push({ start: iso, label: formatSlot(iso), available: cap > (usedBy.get(s.getTime()) ?? 0) });
    }
    return [...days.values()];
  }

  // ---------- Customer bookings ----------

  async createBooking(userId: string, input: HomeCreateBooking): Promise<{ booking: HomeBooking; payment: PaymentOut | null }> {
    const existing = await this.db.query.homeBookings.findFirst({
      where: and(eq(homeBookings.userId, userId), eq(homeBookings.idempotencyKey, input.idempotencyKey)),
    });
    if (existing) return { booking: await this.load(existing.id, "customer"), payment: await this.currentPayment(existing) };

    // The pro has to be able to call the customer, including for pay-after-service bookings.
    const customer = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { phone: true } });
    if (!customer?.phone) throw new AppError(403, "phone_required", "Add and verify your mobile number before booking");

    const city = await this.activeCity(input.cityId);
    const addr = await this.db.query.addresses.findFirst({
      where: and(eq(addresses.id, input.addressId), eq(addresses.userId, userId), isNull(addresses.deletedAt)),
    });
    if (!addr) throw notFound("Address");
    if (!city.pincodes.includes(addr.pincode)) {
      throw badRequest("not_serviceable", `We don't serve PIN ${addr.pincode} in ${city.name} yet`);
    }

    const qtyById = new Map<string, number>();
    for (const i of input.items) qtyById.set(i.serviceId, Math.min(HOME_RULES.maxQtyPerItem, (qtyById.get(i.serviceId) ?? 0) + i.qty));
    const svcs = await this.db.select().from(homeServices).where(inArray(homeServices.id, [...qtyById.keys()]));
    if (svcs.length !== qtyById.size || svcs.some((s) => !s.active)) throw badRequest("service_unavailable", "One of the services is no longer available");
    const categoryIds = new Set(svcs.map((s) => s.categoryId));
    if (categoryIds.size !== 1) throw badRequest("mixed_categories", "Book one category at a time (e.g. all electrician jobs together)");
    const categoryId = svcs[0]!.categoryId;

    const lines = svcs.map((s) => ({ serviceId: s.id, name: s.name, unitPricePaise: s.pricePaise, qty: qtyById.get(s.id)! }));
    const totals = homeTotals(lines);
    if (totals.subtotalPaise < HOME_RULES.minOrderPaise) throw badRequest("below_minimum", "Order is below the minimum");

    const slot = new Date(input.slotStart);
    const bookable = bookableSlotStarts(this.now()).some((s) => s.getTime() === slot.getTime());
    if (!isSlotStart(slot) || !bookable) throw badRequest("invalid_slot", "That time slot can't be booked. Pick another.");

    const address: HomeAddressSnapshot = {
      name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, landmark: addr.landmark, city: addr.city, pincode: addr.pincode,
    };
    // Prepaid only: no cash after the service.
    if (input.payMode !== "online") throw badRequest("prepaid_only", "Bookings are paid online in advance. Pay after service isn't available.");
    if (!this.opts.onlinePayments) throw badRequest("online_payment_off", "Online payment isn't live yet, so bookings are paused. Please check back soon.");
    const online = true;

    const row = await this.db.transaction(async (tx) => {
      // Serialise bookings for the same slot so two customers can't take the last professional.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`home:${city.id}:${categoryId}:${slot.toISOString()}`}))`);
      const cap = await this.capacity(tx, city.id, categoryId);
      const [used] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(homeBookings)
        .where(and(eq(homeBookings.cityId, city.id), eq(homeBookings.categoryId, categoryId), eq(homeBookings.slotStart, slot), this.holdsSlot()));
      if ((used?.n ?? 0) >= cap) throw conflict("slot_full", "That slot just filled up. Pick another time.");

      const [b] = await tx
        .insert(homeBookings)
        .values({
          userId, cityId: city.id, categoryId, addressId: addr.id, address, slotStart: slot,
          status: online ? "pending_payment" : "confirmed", ...totals, payMode: input.payMode,
          startCode: String(randomInt(0, 10_000)).padStart(4, "0"), customerNote: input.note || null,
          idempotencyKey: input.idempotencyKey,
          createdAt: this.now(), updatedAt: this.now(),
        })
        .returning();
      await tx.insert(homeBookingItems).values(lines.map((l) => ({ ...l, bookingId: b!.id })));
      await this.event(tx, b!.id, b!.status, "customer", online ? "Waiting for payment" : "Pay after service");
      if (!online) await this.tellCustomer(tx, b!, "booking_confirmed", { service: svcs[0]!.name + (lines.length > 1 ? ` +${lines.length - 1}` : "") });
      return b!;
    });

    let payment: PaymentOut | null = null;
    if (online) payment = await this.startPayment(row, 1);
    return { booking: await this.load(row.id, "customer"), payment };
  }

  private async startPayment(b: BookingRow, attempt: number): Promise<PaymentOut> {
    const { payment, clientPayload } = await this.payments.createForOrder({
      userId: b.userId, module: "home", referenceId: b.id, amountPaise: b.totalPaise, idempotencyKey: `home:${b.id}:${attempt}`,
    });
    await this.db.update(homeBookings).set({ paymentId: payment.id, updatedAt: this.now() }).where(eq(homeBookings.id, b.id));
    return { id: payment.id, status: payment.status, clientPayload };
  }

  private async currentPayment(b: BookingRow): Promise<PaymentOut | null> {
    if (b.status !== "pending_payment" || !b.paymentId) return null;
    const p = await this.db.query.payments.findFirst({ where: eq(payments.id, b.paymentId) });
    if (!p || p.status !== "created") return null;
    return { id: p.id, status: p.status, clientPayload: { order_id: p.providerOrderId, amount: p.amountPaise } };
  }

  /** Start (or restart after a failure) the online payment for an unpaid booking. */
  async pay(userId: string, bookingId: string): Promise<{ booking: HomeBooking; payment: PaymentOut }> {
    const b = await this.owned(userId, bookingId);
    if (b.status !== "pending_payment" || b.payMode !== "online") throw badRequest("not_payable", "This booking doesn't need payment");
    if (!this.opts.onlinePayments) throw badRequest("online_payment_off", "Online payment isn't live yet, so bookings are paused. Please check back soon.");
    const current = await this.currentPayment(b);
    if (current) return { booking: await this.load(b.id, "customer"), payment: current };
    const [prior] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .where(and(eq(payments.module, "home"), eq(payments.referenceId, b.id)));
    const payment = await this.startPayment(b, (prior?.n ?? 0) + 1);
    return { booking: await this.load(b.id, "customer"), payment };
  }

  /** Called by PaymentService inside its transaction whenever a home payment changes status. */
  private async onPayment(p: PaymentRow, tx: Tx): Promise<void> {
    // referenceId is free text on the shared payments table; only our own booking ids are uuids.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.referenceId)) return;
    const b = await tx.query.homeBookings.findFirst({ where: eq(homeBookings.id, p.referenceId) });
    if (!b || b.paymentId !== p.id) return;
    if ((p.status === "authorized" || p.status === "captured") && b.status === "pending_payment") {
      await tx.update(homeBookings).set({ status: "confirmed", paid: true, updatedAt: this.now() }).where(eq(homeBookings.id, b.id));
      await this.event(tx, b.id, "confirmed", "system", "Payment received");
      const items = await tx.select({ name: homeBookingItems.name }).from(homeBookingItems).where(eq(homeBookingItems.bookingId, b.id));
      await this.tellCustomer(tx, b, "booking_confirmed", { service: (items[0]?.name ?? "") + (items.length > 1 ? ` +${items.length - 1}` : "") });
    } else if (p.status === "failed" && b.status === "pending_payment") {
      await this.event(tx, b.id, "pending_payment", "system", "Payment failed. Try again.");
    }
  }

  async list(userId: string): Promise<HomeBooking[]> {
    const rows = await this.db
      .select({ id: homeBookings.id })
      .from(homeBookings)
      .where(eq(homeBookings.userId, userId))
      .orderBy(desc(homeBookings.createdAt))
      .limit(50);
    return Promise.all(rows.map((r) => this.load(r.id, "customer")));
  }

  async get(userId: string, id: string): Promise<HomeBooking> {
    await this.owned(userId, id);
    return this.load(id, "customer");
  }

  /** Throws 404 unless this customer made the booking. */
  async assertOwner(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
  }

  private async owned(userId: string, id: string): Promise<BookingRow> {
    const b = await this.db.query.homeBookings.findFirst({ where: and(eq(homeBookings.id, id), eq(homeBookings.userId, userId)) });
    if (!b) throw notFound("Booking");
    return b;
  }

  /** Cancel / reschedule rules for this booking right now, and the refund if cancelled now. */
  private cancelInfo(b: BookingRow, p: HomePolicy): HomeCancelInfo {
    const msBefore = b.slotStart.getTime() - this.now().getTime();
    const changeDeadline = new Date(b.slotStart.getTime() - p.customerCutoffMinutes * 60_000).toISOString();
    const reschedulesLeft = Math.max(p.maxReschedules - b.rescheduleCount, 0);
    // Not paid yet: nothing to refund, so it can always be dropped (it can't be moved until it's paid).
    if (b.status === "pending_payment") {
      return { canCancel: true, canReschedule: false, cancelBlock: null, rescheduleBlock: "not_changeable", changeDeadline, quote: null, reschedulesLeft };
    }
    const changeable = CUSTOMER_CHANGEABLE.includes(b.status);
    const tooLate = msBefore < p.customerCutoffMinutes * 60_000;
    const cancelBlock = !changeable ? "not_changeable" : tooLate ? "too_late" : null;
    const rescheduleBlock = cancelBlock ?? (reschedulesLeft === 0 ? "reschedule_limit" : null);
    const quote = changeable && b.paid ? homeRefundQuote(b, Math.floor(msBefore / 60_000), p) : null;
    return { canCancel: !cancelBlock, canReschedule: !rescheduleBlock, cancelBlock, rescheduleBlock, changeDeadline, quote, reschedulesLeft };
  }

  /** What the customer would get back if they cancelled now. */
  async cancelQuote(userId: string, id: string): Promise<HomeCancelInfo> {
    const b = await this.owned(userId, id);
    return this.cancelInfo(b, await this.policy.get());
  }

  async cancel(userId: string, id: string, reason: string | undefined, expectedRefundPaise?: number): Promise<HomeBooking> {
    const b = await this.owned(userId, id);
    const p = await this.policy.get();
    const info = this.cancelInfo(b, p);
    if (!info.canCancel) throw badRequest("cannot_cancel", homeChangeBlockText[info.cancelBlock ?? "not_changeable"](p));
    // The refund moved into a lower slab between showing it and confirming: show the new amount first.
    if (expectedRefundPaise !== undefined && info.quote && info.quote.refundPaise !== expectedRefundPaise) {
      throw new AppError(409, "quote_changed", `Your refund is now ${formatRupees(info.quote.refundPaise)}, because the time moved past a refund step. Check and confirm again.`, { quote: info.quote });
    }
    const minutesBefore = Math.floor((b.slotStart.getTime() - this.now().getTime()) / 60_000);
    await this.cancelInternal(b, "customer", reason || "Cancelled by customer", info.quote ? { minutesBefore, quote: info.quote } : null);
    return this.load(id, "customer");
  }

  /** Free reschedule to another bookable slot. The job goes back to the pool for the new time. */
  async reschedule(userId: string, id: string, slotStart: string): Promise<HomeBooking> {
    const b = await this.owned(userId, id);
    const p = await this.policy.get();
    const info = this.cancelInfo(b, p);
    if (!info.canReschedule) {
      const why = b.status === "pending_payment" ? "Pay for the booking first, then you can move it." : homeChangeBlockText[info.rescheduleBlock ?? "not_changeable"](p);
      throw badRequest("cannot_reschedule", why);
    }
    const slot = new Date(slotStart);
    if (slot.getTime() === b.slotStart.getTime()) throw badRequest("same_slot", "That's the time you already have. Pick another slot.");
    const bookable = bookableSlotStarts(this.now()).some((s) => s.getTime() === slot.getTime());
    if (!isSlotStart(slot) || !bookable) throw badRequest("invalid_slot", "That time slot can't be booked. Pick another.");

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`home:${b.cityId}:${b.categoryId}:${slot.toISOString()}`}))`);
      const cap = await this.capacity(tx, b.cityId, b.categoryId);
      const [used] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(homeBookings)
        .where(and(eq(homeBookings.cityId, b.cityId), eq(homeBookings.categoryId, b.categoryId), eq(homeBookings.slotStart, slot), ne(homeBookings.id, b.id), this.holdsSlot()));
      if ((used?.n ?? 0) >= cap) throw conflict("slot_full", "That slot just filled up. Pick another time.");
      const [u] = await tx
        .update(homeBookings)
        // The assigned professional may not be free at the new time, so the job is offered again.
        .set({ slotStart: slot, status: "confirmed", proId: null, rescheduleCount: sql`${homeBookings.rescheduleCount} + 1`, updatedAt: this.now() })
        .where(and(eq(homeBookings.id, b.id), eq(homeBookings.status, b.status), eq(homeBookings.slotStart, b.slotStart)))
        .returning();
      if (!u) throw conflict("status_changed", "Booking changed meanwhile. Refresh and try again.");
      await this.event(tx, b.id, "confirmed", "customer", `Moved to ${shortWhen(slot)}. Free reschedule.${b.proId ? " Finding a professional for the new time." : ""}`);
      await this.tellCustomer(tx, u, "booking_rescheduled", {}, `rescheduled:${u.rescheduleCount}`);
      if (b.proId) {
        const pro = await tx.query.homePros.findFirst({ where: eq(homePros.id, b.proId), columns: { userId: true } });
        if (pro) await this.notify.notify(tx, { event: "pro_job_cancelled", userId: pro.userId, vars: { code: bookingCode(b.id), when: shortWhen(b.slotStart) }, dedupeKey: `home:booking:${b.id}:pro-moved:${u.rescheduleCount}` });
      }
    });
    return this.load(id, "customer");
  }

  /**
   * customerRefund: the customer cancelled; refund what the rules allow (null = nothing was paid).
   * Otherwise (admin or system) ZARVA cancelled, so everything paid comes back, fee included.
   */
  private async cancelInternal(
    b: BookingRow, actor: Actor, reason: string, customerRefund: { minutesBefore: number; quote: HomeRefundQuote } | null = null,
  ): Promise<void> {
    const minutesBefore = Math.floor((b.slotStart.getTime() - this.now().getTime()) / 60_000);
    const fullQuote: HomeRefundQuote = {
      refundBps: 10_000, basePaise: 0, gstPaise: 0, baseRefundPaise: 0, gstRefundPaise: 0, feeKeptPaise: 0, refundPaise: b.totalPaise, chargePaise: 0,
    };
    const cancellation: HomeCancellation | null = !b.paid
      ? null
      : actor === "customer"
        ? customerRefund ? { by: "customer", at: this.now().toISOString(), ...customerRefund } : null
        : { by: actor === "admin" ? "admin" : "system", at: this.now().toISOString(), minutesBefore, quote: fullQuote };
    const done = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(homeBookings)
        .set({ status: "cancelled", cancelReason: reason, cancellation, updatedAt: this.now() })
        .where(and(eq(homeBookings.id, b.id), eq(homeBookings.status, b.status)))
        .returning();
      if (!u) return false;
      await this.event(tx, b.id, "cancelled", actor, reason);
      await this.tellCustomer(tx, b, "booking_cancelled", { reason });
      if (b.proId) {
        const pro = await tx.query.homePros.findFirst({ where: eq(homePros.id, b.proId), columns: { userId: true } });
        if (pro) await this.notify.notify(tx, { event: "pro_job_cancelled", userId: pro.userId, vars: { code: bookingCode(b.id), when: shortWhen(b.slotStart) }, dedupeKey: `home:booking:${b.id}:pro-cancelled` });
      }
      return true;
    });
    if (!done) throw conflict("status_changed", "Booking changed meanwhile. Refresh and try again.");

    // Refund outside the transaction: it's a call to the payment provider.
    if (b.paid && b.paymentId) {
      const p = await this.db.query.payments.findFirst({ where: eq(payments.id, b.paymentId) });
      const wanted = cancellation?.quote.refundPaise ?? 0;
      if (p && (p.status === "captured" || p.status === "partially_refunded")) {
        const amount = Math.min(wanted, p.amountPaise - p.refundedPaise);
        if (amount > 0) {
          await this.payments.refund(p.id, amount);
          await this.db.update(homeBookings).set({ refundedPaise: amount }).where(eq(homeBookings.id, b.id));
          const kept = b.totalPaise - amount;
          await this.event(this.db, b.id, "cancelled", "system", `Refund of ${formatRupees(amount)} started. Reaches you in 5-7 days.${kept > 0 ? ` Cancellation charge ${formatRupees(kept)} (see the refund rules).` : ""}`);
          await this.tellCustomer(this.db, b, "refund_started", { amount: formatRupees(amount) });
        } else {
          await this.event(this.db, b.id, "cancelled", "system", "No refund: cancelled too close to the slot under the refund rules.");
        }
      } else if (wanted > 0) {
        await this.event(this.db, b.id, "cancelled", "system", `Refund of ${formatRupees(wanted)} will be issued once the payment settles.`);
      }
    }
  }

  // ---------- Professionals ----------

  async proFor(userId: string): Promise<ProRow | undefined> {
    return this.db.query.homePros.findFirst({ where: eq(homePros.userId, userId) });
  }

  private async activePro(userId: string): Promise<ProRow> {
    const p = await this.proFor(userId);
    if (!p) throw forbidden("You are not registered as a professional");
    if (p.status !== "active") throw forbidden(p.status === "pending" ? "Your profile is waiting for approval" : "Your profile is suspended");
    return p;
  }

  async proJobs(userId: string): Promise<{ available: HomeBooking[]; mine: HomeBooking[] }> {
    const pro = await this.activePro(userId);
    const recent = new Date(this.now().getTime() - 6 * 3600_000);
    const open = await this.db
      .select({ id: homeBookings.id })
      .from(homeBookings)
      .where(and(
        eq(homeBookings.cityId, pro.cityId), eq(homeBookings.status, "confirmed"), isNull(homeBookings.proId),
        inArray(homeBookings.categoryId, pro.categoryIds), gt(homeBookings.slotStart, this.now()),
      ))
      .orderBy(asc(homeBookings.slotStart))
      .limit(50);
    const mine = await this.db
      .select({ id: homeBookings.id })
      .from(homeBookings)
      .where(and(eq(homeBookings.proId, pro.id), or(ne(homeBookings.status, "completed"), gt(homeBookings.updatedAt, recent))))
      .orderBy(asc(homeBookings.slotStart))
      .limit(50);
    return {
      available: await Promise.all(open.map((r) => this.load(r.id, "preview"))),
      mine: await Promise.all(mine.map((r) => this.load(r.id, "pro"))),
    };
  }

  async accept(userId: string, bookingId: string): Promise<HomeBooking> {
    const pro = await this.activePro(userId);
    const b = await this.db.query.homeBookings.findFirst({ where: eq(homeBookings.id, bookingId) });
    if (!b || b.cityId !== pro.cityId || !pro.categoryIds.includes(b.categoryId)) throw notFound("Job");
    await this.assign(b, pro, "pro", true);
    return this.load(bookingId, "pro");
  }

  private async assign(b: BookingRow, pro: ProRow, actor: Actor, mustBeOpen: boolean): Promise<void> {
    const allowed: HomeBookingStatus[] = mustBeOpen ? ["confirmed"] : ["confirmed", "assigned"];
    try {
      await this.db.transaction(async (tx) => {
        const [u] = await tx
          .update(homeBookings)
          .set({ proId: pro.id, status: "assigned", updatedAt: this.now() })
          .where(and(
            eq(homeBookings.id, b.id), inArray(homeBookings.status, allowed),
            mustBeOpen ? isNull(homeBookings.proId) : sql`true`,
          ))
          .returning();
        if (!u) throw conflict("job_taken", "Another professional already took this job");
        await this.event(tx, b.id, "assigned", actor, `${pro.name} will do this job`);
        // Keyed by pro: a reassignment to someone else is news, a repeated click is not.
        await this.tellCustomer(tx, b, "pro_assigned", { pro: pro.name, startCode: b.startCode }, `assigned:${pro.id}`);
        if (actor !== "pro") {
          await this.notify.notify(tx, {
            event: "pro_job_assigned", userId: pro.userId,
            vars: { code: bookingCode(b.id), when: shortWhen(b.slotStart), area: (b.address as HomeAddressSnapshot).line2 ?? (b.address as HomeAddressSnapshot).pincode },
            dedupeKey: `home:booking:${b.id}:pro-assigned:${pro.id}`,
          });
        }
      });
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw conflict("slot_clash", `${pro.name} already has a job at this time`);
      throw e;
    }
  }

  async proCancelStats(userId: string): Promise<HomePartnerCancelStats> {
    const pro = await this.activePro(userId);
    return this.cancellations.stats(this.db, pro.id);
  }

  /**
   * A professional drops a job they accepted. The customer keeps the booking: it goes back to the
   * job list for another professional. Counts toward the daily and weekly cancellation limits.
   */
  async proCancel(userId: string, bookingId: string, reason: string): Promise<HomePartnerCancelStats> {
    const pro = await this.activePro(userId);
    const b = await this.db.query.homeBookings.findFirst({ where: and(eq(homeBookings.id, bookingId), eq(homeBookings.proId, pro.id)) });
    if (!b) throw notFound("Job");
    if (!PRO_CANCELLABLE.includes(b.status)) throw badRequest("cannot_cancel", "A job can't be cancelled after you have started it. Call ZARVA support.");
    const p = await this.policy.get();
    const before = await this.cancellations.stats(this.db, pro.id);
    if (!before.canCancel) {
      throw new AppError(403, "weekly_cancel_limit", `You have cancelled ${before.week} jobs this week, the most allowed (${p.partnerMaxCancelsPerWeek}). Please do this job, or call ZARVA support.`);
    }
    await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(homeBookings)
        .set({ status: "confirmed", proId: null, updatedAt: this.now() })
        .where(and(eq(homeBookings.id, b.id), eq(homeBookings.proId, pro.id), eq(homeBookings.status, b.status)))
        .returning();
      if (!u) throw conflict("status_changed", "Job changed meanwhile. Refresh.");
      await this.cancellations.record(tx, pro.id, b.id, reason);
      await this.event(tx, b.id, "confirmed", "pro", "Your professional can't make it. We are finding another one.");
      await this.tellCustomer(tx, b, "pro_changed", {}, `pro-changed:${pro.id}`);
    });
    return this.cancellations.stats(this.db, pro.id);
  }

  async proUpdate(userId: string, bookingId: string, to: HomeBookingStatus, startCode: string | undefined): Promise<HomeBooking> {
    const pro = await this.activePro(userId);
    const b = await this.db.query.homeBookings.findFirst({ where: and(eq(homeBookings.id, bookingId), eq(homeBookings.proId, pro.id)) });
    if (!b) throw notFound("Job");
    if (proNextStatus[b.status] !== to) throw badRequest("invalid_transition", `Can't go from "${homeStatusLabel[b.status]}" to "${homeStatusLabel[to]}"`);
    if (to === "in_progress" && startCode !== b.startCode) throw badRequest("wrong_start_code", "Wrong start code. Ask the customer for the 4-digit code.");
    const cashCollected = to === "completed" && b.payMode === "after_service";
    await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(homeBookings)
        .set({ status: to, ...(cashCollected ? { paid: true } : {}), updatedAt: this.now() })
        .where(and(eq(homeBookings.id, b.id), eq(homeBookings.status, b.status)))
        .returning();
      if (!u) throw conflict("status_changed", "Job changed meanwhile. Refresh.");
      await this.event(tx, b.id, to, "pro", cashCollected ? `Payment of ₹${b.totalPaise / 100} collected by professional` : null);
      if (to === "on_the_way") {
        const proUser = await tx.query.users.findFirst({ where: eq(users.id, pro.userId), columns: { phone: true } });
        await this.tellCustomer(tx, b, "pro_on_the_way", { pro: pro.name, phone: formatPhone(proUser?.phone ?? "") });
      }
      if (to === "completed") {
        await this.earnings.recordJob(tx, u, pro);
        // The bill exists from the moment the job is done, numbered in completion order.
        await this.invoices.issue(tx, u);
        await this.tellCustomer(tx, b, "job_completed", { amount: formatRupees(b.totalPaise) });
      }
    });
    return this.load(bookingId, "pro");
  }

  // ---------- Admin ----------

  async adminBookings(status: HomeBookingStatus | undefined): Promise<HomeBooking[]> {
    const rows = await this.db
      .select({ id: homeBookings.id })
      .from(homeBookings)
      .where(status ? eq(homeBookings.status, status) : undefined)
      .orderBy(desc(homeBookings.slotStart))
      .limit(100);
    return Promise.all(rows.map((r) => this.load(r.id, "admin")));
  }

  async adminAssign(bookingId: string, proId: string): Promise<HomeBooking> {
    const b = await this.db.query.homeBookings.findFirst({ where: eq(homeBookings.id, bookingId) });
    if (!b) throw notFound("Booking");
    const pro = await this.db.query.homePros.findFirst({ where: eq(homePros.id, proId) });
    if (!pro || pro.status !== "active") throw badRequest("pro_unavailable", "That professional isn't active");
    if (pro.cityId !== b.cityId || !pro.categoryIds.includes(b.categoryId)) throw badRequest("pro_mismatch", "That professional doesn't do this service in this city");
    await this.assign(b, pro, "admin", false);
    return this.load(bookingId, "admin");
  }

  async adminCancel(bookingId: string, reason: string): Promise<HomeBooking> {
    const b = await this.db.query.homeBookings.findFirst({ where: eq(homeBookings.id, bookingId) });
    if (!b) throw notFound("Booking");
    if (b.status === "completed" || b.status === "cancelled") throw badRequest("cannot_cancel", "Booking is already closed");
    await this.cancelInternal(b, "admin", reason);
    return this.load(bookingId, "admin");
  }

  async adminServices(): Promise<HomeService[]> {
    const rows = await this.db.select().from(homeServices).orderBy(asc(homeServices.categoryId), asc(homeServices.sort));
    return rows.map(toService);
  }

  async adminUpdateService(id: string, patch: { pricePaise?: number; active?: boolean }): Promise<HomeService> {
    const [s] = await this.db.update(homeServices).set(patch).where(eq(homeServices.id, id)).returning();
    if (!s) throw notFound("Service");
    return toService(s);
  }

  // ---------- Helpers ----------

  private async event(db: Db | Tx, bookingId: string, status: HomeBookingStatus, actor: Actor, note: string | null) {
    await db.insert(homeBookingEvents).values({ bookingId, status, actor, note, createdAt: this.now() });
  }

  /** SMS / WhatsApp to the customer who made the booking. `vars.code` and `vars.when` are filled in here. */
  private async tellCustomer<E extends "booking_confirmed" | "pro_assigned" | "pro_on_the_way" | "job_completed" | "booking_cancelled" | "refund_started" | "booking_rescheduled" | "pro_changed">(
    db: Db | Tx, b: BookingRow, event: E, vars: Record<string, string>, key: string = event,
  ): Promise<void> {
    await this.notify.notify(db, {
      event, userId: b.userId, dedupeKey: `home:booking:${b.id}:${key}`,
      vars: { code: bookingCode(b.id), when: shortWhen(b.slotStart), ...vars } as never,
    });
  }

  async adminCategories() {
    const rows = await this.db.select().from(homeCategories).orderBy(asc(homeCategories.sort));
    return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, commissionBps: c.commissionBps }));
  }

  async adminSetCommission(id: string, commissionBps: number) {
    const [c] = await this.db.update(homeCategories).set({ commissionBps }).where(eq(homeCategories.id, id)).returning();
    if (!c) throw notFound("Category");
    return { id: c.id, slug: c.slug, name: c.name, icon: c.icon, commissionBps: c.commissionBps };
  }

  private async load(id: string, view: View): Promise<HomeBooking> {
    const b = await this.db.query.homeBookings.findFirst({ where: eq(homeBookings.id, id) });
    if (!b) throw notFound("Booking");
    const [items, events, cat, pro] = await Promise.all([
      this.db.select().from(homeBookingItems).where(eq(homeBookingItems.bookingId, id)).orderBy(asc(homeBookingItems.name)),
      this.db.select().from(homeBookingEvents).where(eq(homeBookingEvents.bookingId, id)).orderBy(asc(homeBookingEvents.seq)),
      this.db.query.homeCategories.findFirst({ where: eq(homeCategories.id, b.categoryId) }),
      b.proId ? this.db.query.homePros.findFirst({ where: eq(homePros.id, b.proId) }) : Promise.resolve(undefined),
    ]);
    const proUser = pro && view !== "preview" ? await this.db.query.users.findFirst({ where: eq(users.id, pro.userId) }) : undefined;
    const policy = view === "customer" ? await this.policy.get() : null;
    const cancelInfo = policy ? this.cancelInfo(b, policy) : undefined;
    const proRating = pro && view === "customer" ? (await this.reviews.proSummaries([pro.id])).get(pro.id) : undefined;
    const closed = b.status === "completed";
    const invoiceNumber = closed && (view === "customer" || view === "admin") ? await this.invoices.numberFor(b.id) : null;
    const review = closed && view === "customer" ? await this.reviews.forBooking(b.userId, b.id) : undefined;
    const addr = b.address as HomeAddressSnapshot;
    const address: HomeAddressSnapshot = view === "preview"
      ? { name: "", phone: "", line1: "", line2: addr.line2, landmark: addr.landmark, city: addr.city, pincode: addr.pincode }
      : addr;
    return {
      id: b.id,
      code: bookingCode(b.id),
      status: b.status,
      statusLabel: homeStatusLabel[b.status],
      cityId: b.cityId,
      categoryId: b.categoryId,
      categoryName: cat?.name ?? "",
      slotStart: b.slotStart.toISOString(),
      address,
      items: items.map((i) => ({ serviceId: i.serviceId, name: i.name, unitPricePaise: i.unitPricePaise, qty: i.qty })),
      subtotalPaise: b.subtotalPaise,
      feePaise: b.feePaise,
      totalPaise: b.totalPaise,
      payMode: b.payMode,
      paymentId: view === "preview" ? null : b.paymentId,
      paid: b.paid,
      refundedPaise: b.refundedPaise,
      ...(view === "customer" || view === "admin" ? { startCode: b.startCode } : {}),
      pro: pro
        ? {
          name: pro.name,
          ...(proUser?.phone ? { phone: proUser.phone } : {}),
          ...(proRating ? { rating: { average: proRating.average, count: proRating.count } } : {}),
        }
        : null,
      // A completed job always has a bill; older jobs get their number on first download.
      ...(view === "customer" || view === "admin" ? { invoiceNumber, hasInvoice: closed } : {}),
      ...(review ? { review } : {}),
      customerNote: b.customerNote,
      canCancel: cancelInfo?.canCancel ?? false,
      ...(cancelInfo ? { cancelInfo } : {}),
      rescheduleCount: b.rescheduleCount,
      cancellation: view === "preview" ? null : (b.cancellation as HomeCancellation | null),
      events: view === "preview" ? [] : events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
      createdAt: b.createdAt.toISOString(),
    };
  }
}

/** "23 Nov, 11 AM" in India time. Fits the 30-character SMS variable limit. */
export function shortWhen(slot: Date): string {
  const day = slot.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return `${day}, ${formatSlot(slot.toISOString()).split(" – ")[0]}`;
}

export interface PaymentOut { id: string; status: string; clientPayload: Record<string, unknown> }

function toService(s: typeof homeServices.$inferSelect): HomeService {
  return {
    id: s.id, categoryId: s.categoryId, slug: s.slug, name: s.name, description: s.description,
    pricePaise: s.pricePaise, durationMin: s.durationMin, inclusions: s.inclusions, active: s.active,
  };
}
