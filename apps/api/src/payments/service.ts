import { and, eq, sql } from "drizzle-orm";
import type { ClientConfirmation, PaymentProvider } from "@zarva/payments";
import type { Db } from "../db/client";
import { paymentEvents, payments, users } from "../db/schema";
import { AppError, badRequest, notFound } from "../lib/errors";

export interface CreateForOrderInput {
  userId: string;
  /** Vertical id that owns the order, e.g. "home". */
  module: string;
  /** The vertical's own order/booking id. */
  referenceId: string;
  amountPaise: number;
  /** Same key returns the same payment, so a double-tap never charges twice. */
  idempotencyKey: string;
}

export type PaymentRow = typeof payments.$inferSelect;

/**
 * The only way any vertical takes money. Verticals call createForOrder(), hand clientPayload
 * to the app, and listen for the status change (later: an outbox/event bus).
 */
export class PaymentService {
  constructor(private db: Db, private provider: PaymentProvider) {}

  async createForOrder(input: CreateForOrderInput): Promise<{ payment: PaymentRow; clientPayload: Record<string, unknown> }> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw badRequest("invalid_amount", "Amount must be at least ₹1 in whole paise");
    const existing = await this.db.query.payments.findFirst({
      where: and(eq(payments.userId, input.userId), eq(payments.idempotencyKey, input.idempotencyKey)),
    });
    if (existing) {
      if (existing.amountPaise !== input.amountPaise || existing.referenceId !== input.referenceId) {
        throw new AppError(409, "idempotency_conflict", "Idempotency key reused with different details");
      }
      return { payment: existing, clientPayload: { order_id: existing.providerOrderId, amount: existing.amountPaise, reused: true } };
    }
    const user = await this.db.query.users.findFirst({ where: eq(users.id, input.userId) });
    if (!user) throw notFound("User");

    const [row] = await this.db
      .insert(payments)
      .values({ ...input, provider: this.provider.name })
      .returning();
    const created = await this.provider.createPayment({
      amountPaise: input.amountPaise,
      receipt: row!.id,
      customer: { phone: user.phone, email: user.email, name: user.name },
      notes: { module: input.module, referenceId: input.referenceId },
    });
    const [updated] = await this.db
      .update(payments)
      .set({ providerOrderId: created.providerOrderId, updatedAt: new Date() })
      .where(eq(payments.id, row!.id))
      .returning();
    return { payment: updated!, clientPayload: created.clientPayload };
  }

  /** Client-side confirmation: fast UI feedback. Marks authorized; the webhook marks captured. */
  async confirmFromClient(userId: string, c: ClientConfirmation): Promise<PaymentRow> {
    const p = await this.db.query.payments.findFirst({
      where: and(eq(payments.providerOrderId, c.providerOrderId), eq(payments.userId, userId)),
    });
    if (!p) throw notFound("Payment");
    if (!this.provider.verifyClientConfirmation(c)) throw badRequest("invalid_signature", "Payment could not be verified");
    if (p.status !== "created") return p;
    const [u] = await this.db
      .update(payments)
      .set({ status: "authorized", providerPaymentId: c.providerPaymentId, updatedAt: new Date() })
      .where(and(eq(payments.id, p.id), eq(payments.status, "created")))
      .returning();
    return u ?? p;
  }

  /** Webhook is the source of truth. Idempotent: duplicate event ids are ignored. */
  async handleWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<{ duplicate: boolean }> {
    const ev = this.provider.parseWebhook(rawBody, headers);
    return this.db.transaction(async (tx) => {
      const p = ev.providerOrderId
        ? await tx.query.payments.findFirst({ where: eq(payments.providerOrderId, ev.providerOrderId) })
        : undefined;
      const inserted = await tx
        .insert(paymentEvents)
        .values({ provider: ev.provider, eventId: ev.eventId, paymentId: p?.id, type: ev.type, payload: ev.raw as object })
        .onConflictDoNothing()
        .returning({ id: paymentEvents.id });
      if (inserted.length === 0) return { duplicate: true };
      if (!p) return { duplicate: false };

      if (ev.type === "payment.captured") {
        if (ev.amountPaise !== null && ev.amountPaise !== p.amountPaise) {
          throw new AppError(422, "amount_mismatch", `Captured ${ev.amountPaise} but expected ${p.amountPaise}`);
        }
        await tx
          .update(payments)
          .set({ status: "captured", providerPaymentId: ev.providerPaymentId ?? p.providerPaymentId, method: ev.method, updatedAt: new Date() })
          .where(eq(payments.id, p.id));
      } else if (ev.type === "payment.failed" && (p.status === "created" || p.status === "authorized")) {
        await tx.update(payments).set({ status: "failed", method: ev.method, updatedAt: new Date() }).where(eq(payments.id, p.id));
      }
      return { duplicate: false };
    });
  }

  async refund(paymentId: string, amountPaise: number): Promise<PaymentRow> {
    const p = await this.db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
    if (!p) throw notFound("Payment");
    if (p.status !== "captured" && p.status !== "partially_refunded") throw badRequest("not_refundable", "Only captured payments can be refunded");
    if (!p.providerPaymentId) throw badRequest("not_refundable", "Missing provider payment id");
    if (!Number.isInteger(amountPaise) || amountPaise <= 0 || p.refundedPaise + amountPaise > p.amountPaise) {
      throw badRequest("invalid_amount", "Refund exceeds amount paid");
    }
    await this.provider.refund(p.providerPaymentId, amountPaise);
    const total = p.refundedPaise + amountPaise;
    const [u] = await this.db
      .update(payments)
      .set({
        refundedPaise: sql`${payments.refundedPaise} + ${amountPaise}`,
        status: total === p.amountPaise ? "refunded" : "partially_refunded",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, p.id))
      .returning();
    return u!;
  }
}
