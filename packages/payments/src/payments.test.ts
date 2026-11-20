import { describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "./crypto";
import { InvalidSignatureError, MockProvider, RazorpayProvider, createPaymentProvider, formatPaise } from "./index";

const cfg = { keyId: "rzp_test_x", keySecret: "ks", webhookSecret: "ws" };

describe("RazorpayProvider", () => {
  it("creates an order with integer paise and UPI shown first", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "order_1", amount: 49900 }), { status: 200 }));
    const p = new RazorpayProvider({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await p.createPayment({ amountPaise: 49900, receipt: "pay_1", customer: { phone: "+919876543210" } });
    expect(r.providerOrderId).toBe("order_1");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ amount: 49900, currency: "INR", receipt: "pay_1" });
    expect(JSON.stringify(r.clientPayload)).toContain("block.upi");
  });
  it("rejects float amounts", async () => {
    const p = new RazorpayProvider(cfg);
    await expect(p.createPayment({ amountPaise: 99.5, receipt: "x", customer: { phone: "" } })).rejects.toThrow();
  });
  it("verifies client signature", () => {
    const p = new RazorpayProvider(cfg);
    const sig = hmacSha256Hex("ks", "order_1|pay_1");
    expect(p.verifyClientConfirmation({ providerOrderId: "order_1", providerPaymentId: "pay_1", signature: sig })).toBe(true);
    expect(p.verifyClientConfirmation({ providerOrderId: "order_1", providerPaymentId: "pay_2", signature: sig })).toBe(false);
    expect(p.verifyClientConfirmation({ providerOrderId: "order_1", providerPaymentId: "pay_1", signature: "zz" })).toBe(false);
  });
  it("parses signed webhooks and rejects tampered ones", () => {
    const p = new RazorpayProvider(cfg);
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 100, method: "upi" } } } });
    const ev = p.parseWebhook(body, { "x-razorpay-signature": hmacSha256Hex("ws", body), "x-razorpay-event-id": "ev_1" });
    expect(ev).toMatchObject({ type: "payment.captured", providerOrderId: "order_1", method: "upi", eventId: "ev_1" });
    expect(() => p.parseWebhook(body + " ", { "x-razorpay-signature": hmacSha256Hex("ws", body) })).toThrow(InvalidSignatureError);
  });
});

describe("MockProvider", () => {
  it("round-trips a simulated success", async () => {
    const m = new MockProvider();
    const created = await m.createPayment({ amountPaise: 10000, receipt: "r", customer: { phone: "" } });
    expect(m.verifyClientConfirmation(m.simulateSuccess(created.providerOrderId))).toBe(true);
  });
  it("is refused in production", () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: "mock", NODE_ENV: "production" })).toThrow();
  });
});

it("formats paise", () => {
  expect(formatPaise(10000)).toBe("₹100");
  expect(formatPaise(12345)).toBe("₹123.45");
});
