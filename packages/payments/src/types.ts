/** All money is integer paise. Never use floats for money. */
export type Paise = number;

export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded";

export interface CreatePaymentInput {
  amountPaise: Paise;
  currency?: "INR";
  /** Our own id for this payment (the payments table row id). Used as the idempotent receipt. */
  receipt: string;
  customer: { phone: string; email?: string | null; name?: string | null };
  notes?: Record<string, string>;
}

export interface CreatedPayment {
  provider: string;
  providerOrderId: string;
  amountPaise: Paise;
  /** Whatever the client checkout SDK needs (Razorpay Checkout options, UPI intent link, ...). */
  clientPayload: Record<string, unknown>;
}

/** What the client sends back after checkout succeeds, to be verified server-side. */
export interface ClientConfirmation {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface NormalisedWebhookEvent {
  provider: string;
  /** Provider's unique event id, used to dedupe retries. */
  eventId: string;
  type: "payment.captured" | "payment.failed" | "payment.authorized" | "refund.processed" | "other";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountPaise: Paise | null;
  method: string | null;
  raw: unknown;
}

export interface RefundResult {
  providerRefundId: string;
  amountPaise: Paise;
  status: "pending" | "processed";
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Returns true only if the signature proves the provider produced this confirmation. */
  verifyClientConfirmation(c: ClientConfirmation): boolean;
  /** Throws InvalidSignatureError when the webhook was not signed by the provider. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): NormalisedWebhookEvent;
  refund(providerPaymentId: string, amountPaise: Paise, notes?: Record<string, string>): Promise<RefundResult>;
}

export class InvalidSignatureError extends Error {
  constructor() {
    super("Invalid payment signature");
  }
}
