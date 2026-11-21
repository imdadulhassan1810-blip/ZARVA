export * from "./types";
export { RazorpayProvider, type RazorpayConfig } from "./razorpay";
export { MockProvider } from "./mock";
import { MockProvider } from "./mock";
import { RazorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

export function createPaymentProvider(env: Record<string, string | undefined>): PaymentProvider {
  const which = env.PAYMENT_PROVIDER ?? "mock";
  if (which === "razorpay") {
    return new RazorpayProvider({
      keyId: env.RAZORPAY_KEY_ID ?? "",
      keySecret: env.RAZORPAY_KEY_SECRET ?? "",
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? "",
    });
  }
  if (which === "mock") {
    if (env.NODE_ENV === "production") throw new Error("Mock payment provider is not allowed in production");
    return new MockProvider();
  }
  throw new Error(`Unknown PAYMENT_PROVIDER ${which}`);
}

/** Rupees string for display. 12345 -> "₹123.45", 10000 -> "₹100". */
export function formatPaise(p: number): string {
  const r = p / 100;
  return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: p % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export * from "./payouts";
