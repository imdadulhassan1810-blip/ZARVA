import { randomUUID } from "node:crypto";
import { hmacSha256Hex, safeEqualHex } from "./crypto";
import { InvalidSignatureError, type ClientConfirmation, type CreatePaymentInput, type PaymentProvider } from "./types";

/**
 * Local development provider. Behaves like Razorpay (same signature scheme) so the
 * whole flow can be tested without keys. Never enable in production.
 */
export class MockProvider implements PaymentProvider {
  readonly name = "mock";
  constructor(private secret = "mock-secret") {}

  async createPayment(input: CreatePaymentInput) {
    const providerOrderId = `mock_order_${randomUUID()}`;
    return {
      provider: this.name,
      providerOrderId,
      amountPaise: input.amountPaise,
      clientPayload: {
        order_id: providerOrderId,
        amount: input.amountPaise,
        upiIntent: `upi://pay?pa=zarva@mock&pn=ZARVA&am=${(input.amountPaise / 100).toFixed(2)}&cu=INR&tr=${input.receipt}`,
      },
    };
  }

  /** Test helper: what a successful checkout would hand back. */
  simulateSuccess(providerOrderId: string): ClientConfirmation {
    const providerPaymentId = `mock_pay_${randomUUID()}`;
    return { providerOrderId, providerPaymentId, signature: hmacSha256Hex(this.secret, `${providerOrderId}|${providerPaymentId}`) };
  }

  /** Test helper: build a signed webhook body. */
  signWebhook(body: object): { rawBody: string; headers: Record<string, string> } {
    const rawBody = JSON.stringify(body);
    return { rawBody, headers: { "x-mock-signature": hmacSha256Hex(this.secret, rawBody), "x-mock-event-id": randomUUID() } };
  }

  verifyClientConfirmation(c: ClientConfirmation) {
    return safeEqualHex(hmacSha256Hex(this.secret, `${c.providerOrderId}|${c.providerPaymentId}`), c.signature);
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const sig = headers["x-mock-signature"];
    if (typeof sig !== "string" || !safeEqualHex(hmacSha256Hex(this.secret, rawBody), sig)) throw new InvalidSignatureError();
    const b = JSON.parse(rawBody) as { event: string; orderId?: string; paymentId?: string; amount?: number };
    const known = ["payment.captured", "payment.failed", "payment.authorized", "refund.processed"];
    return {
      provider: this.name,
      eventId: String(headers["x-mock-event-id"] ?? randomUUID()),
      type: (known.includes(b.event) ? b.event : "other") as "payment.captured",
      providerOrderId: b.orderId ?? null,
      providerPaymentId: b.paymentId ?? null,
      amountPaise: b.amount ?? null,
      method: "upi",
      raw: b,
    };
  }

  async refund(_providerPaymentId: string, amountPaise: number) {
    return { providerRefundId: `mock_rfnd_${randomUUID()}`, amountPaise, status: "processed" as const };
  }
}
