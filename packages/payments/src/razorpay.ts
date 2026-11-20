import { hmacSha256Hex, safeEqualHex } from "./crypto";
import {
  InvalidSignatureError,
  type ClientConfirmation,
  type CreatePaymentInput,
  type CreatedPayment,
  type NormalisedWebhookEvent,
  type PaymentProvider,
  type RefundResult,
} from "./types";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Razorpay covers UPI (collect + intent), cards, netbanking and wallets through one Orders API.
 * Flow: server creates an Order -> client opens Razorpay Checkout with clientPayload ->
 * client posts back {order_id, payment_id, signature} -> server verifies -> webhook confirms capture.
 * Treat the webhook as the source of truth; the client confirmation only gives faster UI feedback.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(private cfg: RazorpayConfig) {
    if (!cfg.keyId || !cfg.keySecret || !cfg.webhookSecret) throw new Error("Razorpay keys missing");
    this.baseUrl = cfg.baseUrl ?? "https://api.razorpay.com/v1";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async api<T>(path: string, body: unknown): Promise<T> {
    const auth = Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(`Razorpay ${path} failed: ${json.error?.description ?? res.status}`);
    return json;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw new Error("Amount must be integer paise >= 100");
    const order = await this.api<{ id: string; amount: number }>("/orders", {
      amount: input.amountPaise,
      currency: input.currency ?? "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    });
    return {
      provider: this.name,
      providerOrderId: order.id,
      amountPaise: order.amount,
      clientPayload: {
        key: this.cfg.keyId,
        order_id: order.id,
        amount: order.amount,
        currency: input.currency ?? "INR",
        name: "ZARVA",
        prefill: { contact: input.customer.phone, email: input.customer.email ?? undefined, name: input.customer.name ?? undefined },
        // Show UPI first: it is the dominant method in India.
        config: { display: { preferences: { show_default_blocks: true }, sequence: ["block.upi"] } },
      },
    };
  }

  verifyClientConfirmation(c: ClientConfirmation): boolean {
    const expected = hmacSha256Hex(this.cfg.keySecret, `${c.providerOrderId}|${c.providerPaymentId}`);
    return safeEqualHex(expected, c.signature);
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): NormalisedWebhookEvent {
    const sig = headers["x-razorpay-signature"];
    const eventId = headers["x-razorpay-event-id"];
    if (typeof sig !== "string" || !safeEqualHex(hmacSha256Hex(this.cfg.webhookSecret, rawBody), sig)) {
      throw new InvalidSignatureError();
    }
    const body = JSON.parse(rawBody) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; method: string } } };
    };
    const p = body.payload?.payment?.entity;
    const known = ["payment.captured", "payment.failed", "payment.authorized", "refund.processed"] as const;
    const type = (known as readonly string[]).includes(body.event) ? (body.event as (typeof known)[number]) : "other";
    return {
      provider: this.name,
      eventId: typeof eventId === "string" ? eventId : `${body.event}:${p?.id ?? "unknown"}`,
      type,
      providerOrderId: p?.order_id ?? null,
      providerPaymentId: p?.id ?? null,
      amountPaise: p?.amount ?? null,
      method: p?.method ?? null,
      raw: body,
    };
  }

  async refund(providerPaymentId: string, amountPaise: number, notes?: Record<string, string>): Promise<RefundResult> {
    const r = await this.api<{ id: string; amount: number; status: string }>(`/payments/${providerPaymentId}/refund`, {
      amount: amountPaise,
      notes: notes ?? {},
    });
    return { providerRefundId: r.id, amountPaise: r.amount, status: r.status === "processed" ? "processed" : "pending" };
  }
}
