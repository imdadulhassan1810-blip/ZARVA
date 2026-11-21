import { randomUUID } from "node:crypto";
import { hmacSha256Hex, safeEqualHex } from "./crypto";
import { InvalidSignatureError, type Paise } from "./types";

/**
 * Money going OUT to service professionals. Separate from PaymentProvider (money coming in).
 *
 * - "manual": nothing is sent automatically. The admin pays the pro by UPI from the business
 *   account, then types the UPI reference (UTR) into the admin screen. Works from day one.
 * - "razorpayx": RazorpayX Payouts API sends UPI / IMPS automatically and reports back by webhook.
 *   Needs Razorpay KYC + a RazorpayX current account. Switch with PAYOUT_PROVIDER=razorpayx.
 */
export type PayoutDestination =
  | { kind: "upi"; vpa: string; name: string }
  | { kind: "bank"; accountNumber: string; ifsc: string; name: string };

export interface SendPayoutInput {
  /** Our payout row id. Also the idempotency key: retrying the same payout never pays twice. */
  payoutId: string;
  amountPaise: Paise;
  destination: PayoutDestination;
  /** Shown on the pro's bank statement (max 30 chars). */
  narration: string;
  /** Our reference for the pro, e.g. their pro id. */
  contactReference: string;
}

export interface SentPayout {
  providerPayoutId: string | null;
  /** manual: an admin must pay and record the UTR. processing: provider is sending it. paid: already settled. */
  status: "manual" | "processing" | "paid";
  utr?: string | null;
}

export interface PayoutWebhookEvent {
  eventId: string;
  providerPayoutId: string;
  status: "paid" | "failed" | "other";
  utr: string | null;
  reason: string | null;
}

export interface PayoutProvider {
  readonly name: "manual" | "razorpayx" | "mock";
  send(input: SendPayoutInput): Promise<SentPayout>;
  /** Throws InvalidSignatureError when the webhook was not signed by the provider. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PayoutWebhookEvent;
}

/** The provider refused this payout (bad account, low balance...). Safe to treat as "not paid". */
export class PayoutRejectedError extends Error {}

export class ManualPayoutProvider implements PayoutProvider {
  readonly name = "manual" as const;
  async send(): Promise<SentPayout> {
    return { providerPayoutId: null, status: "manual" };
  }
  parseWebhook(): PayoutWebhookEvent {
    throw new InvalidSignatureError();
  }
}

/** Tests: records what would be sent, settles instantly or fails on demand. */
export class MockPayoutProvider implements PayoutProvider {
  readonly name = "mock" as const;
  sent: SendPayoutInput[] = [];
  failNext = false;
  async send(input: SendPayoutInput): Promise<SentPayout> {
    if (this.failNext) {
      this.failNext = false;
      throw new PayoutRejectedError("Mock payout rejected");
    }
    this.sent.push(input);
    return { providerPayoutId: `pout_mock_${randomUUID().slice(0, 8)}`, status: "processing" };
  }
  parseWebhook(rawBody: string): PayoutWebhookEvent {
    return JSON.parse(rawBody) as PayoutWebhookEvent;
  }
}

export interface RazorpayXConfig {
  keyId: string;
  keySecret: string;
  /** Your RazorpayX current account number (Dashboard → My Account → Banking). */
  accountNumber: string;
  webhookSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * RazorpayX "composite" payout: contact + fund account + payout in one call.
 * Docs: https://razorpay.com/docs/api/x/payout-composite/
 */
export class RazorpayXPayoutProvider implements PayoutProvider {
  readonly name = "razorpayx" as const;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(private cfg: RazorpayXConfig) {
    if (!cfg.keyId || !cfg.keySecret || !cfg.accountNumber || !cfg.webhookSecret) {
      throw new Error("RazorpayX needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER and RAZORPAYX_WEBHOOK_SECRET");
    }
    this.baseUrl = cfg.baseUrl ?? "https://api.razorpay.com/v1";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async send(input: SendPayoutInput): Promise<SentPayout> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw new Error("Payout must be integer paise >= 100");
    const d = input.destination;
    const contact = { name: d.name, type: "vendor", reference_id: input.contactReference.slice(0, 40) };
    const fund_account = d.kind === "upi"
      ? { account_type: "vpa", vpa: { address: d.vpa }, contact }
      : { account_type: "bank_account", bank_account: { name: d.name, ifsc: d.ifsc, account_number: d.accountNumber }, contact };
    const auth = Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.baseUrl}/payouts`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
        // Same payout id = same payout, even if our request is retried after a timeout.
        "X-Payout-Idempotency": input.payoutId,
      },
      body: JSON.stringify({
        account_number: this.cfg.accountNumber,
        amount: input.amountPaise,
        currency: "INR",
        mode: d.kind === "upi" ? "UPI" : "IMPS",
        purpose: "payout",
        fund_account,
        queue_if_low_balance: true,
        reference_id: input.payoutId,
        narration: input.narration.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 30),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; utr?: string | null; error?: { description?: string } };
    // 4xx = Razorpay looked at it and said no: nothing was paid. 5xx / network = unknown, don't assume.
    if (res.status >= 400 && res.status < 500) throw new PayoutRejectedError(`RazorpayX refused the payout: ${json.error?.description ?? res.status}`);
    if (!res.ok || !json.id) throw new Error(`RazorpayX payout status unknown (${res.status}). Check the RazorpayX dashboard.`);
    return { providerPayoutId: json.id, status: json.status === "processed" ? "paid" : "processing", utr: json.utr ?? null };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): PayoutWebhookEvent {
    const sig = headers["x-razorpay-signature"];
    if (typeof sig !== "string" || !safeEqualHex(hmacSha256Hex(this.cfg.webhookSecret, rawBody), sig)) throw new InvalidSignatureError();
    const body = JSON.parse(rawBody) as {
      event: string;
      payload?: { payout?: { entity?: { id: string; utr?: string | null; failure_reason?: string | null; status_details?: { description?: string } } } };
    };
    const p = body.payload?.payout?.entity;
    if (!p?.id) throw new InvalidSignatureError();
    const status = body.event === "payout.processed" ? "paid"
      : ["payout.failed", "payout.reversed", "payout.rejected"].includes(body.event) ? "failed" : "other";
    const eventId = headers["x-razorpay-event-id"];
    return {
      eventId: typeof eventId === "string" ? eventId : `${body.event}:${p.id}`,
      providerPayoutId: p.id,
      status,
      utr: p.utr ?? null,
      reason: p.failure_reason ?? p.status_details?.description ?? null,
    };
  }
}

export function createPayoutProvider(env: Record<string, string | undefined>): PayoutProvider {
  const which = env.PAYOUT_PROVIDER ?? "manual";
  if (which === "razorpayx") {
    return new RazorpayXPayoutProvider({
      keyId: env.RAZORPAY_KEY_ID ?? "",
      keySecret: env.RAZORPAY_KEY_SECRET ?? "",
      accountNumber: env.RAZORPAYX_ACCOUNT_NUMBER ?? "",
      webhookSecret: env.RAZORPAYX_WEBHOOK_SECRET ?? "",
    });
  }
  if (which === "manual") return new ManualPayoutProvider();
  throw new Error(`Unknown PAYOUT_PROVIDER ${which}`);
}
