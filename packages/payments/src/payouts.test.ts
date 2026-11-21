import { describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "./crypto";
import { InvalidSignatureError, ManualPayoutProvider, PayoutRejectedError, RazorpayXPayoutProvider, createPayoutProvider } from "./index";

const cfg = { keyId: "rzp_test_x", keySecret: "ks", accountNumber: "2323230000000000", webhookSecret: "whx" };

describe("RazorpayXPayoutProvider", () => {
  it("sends a UPI payout with an idempotency key and our payout id as reference", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "pout_1", status: "processing" }), { status: 200 }));
    const p = new RazorpayXPayoutProvider({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await p.send({
      payoutId: "11111111-2222-3333-4444-555555555555", amountPaise: 150000,
      destination: { kind: "upi", vpa: "subrata@okaxis", name: "Subrata Mondal" }, narration: "ZARVA payout #1!", contactReference: "pro_1",
    });
    expect(r).toEqual({ providerPayoutId: "pout_1", status: "processing", utr: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/payouts");
    expect((init.headers as Record<string, string>)["X-Payout-Idempotency"]).toBe("11111111-2222-3333-4444-555555555555");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      account_number: cfg.accountNumber, amount: 150000, mode: "UPI", reference_id: "11111111-2222-3333-4444-555555555555",
      fund_account: { account_type: "vpa", vpa: { address: "subrata@okaxis" }, contact: { name: "Subrata Mondal", type: "vendor" } },
      narration: "ZARVA payout 1",
    });
  });

  it("uses IMPS for bank accounts and surfaces API errors", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { description: "Insufficient balance" } }), { status: 400 }));
    const p = new RazorpayXPayoutProvider({ ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.send({
      payoutId: "x", amountPaise: 10000, destination: { kind: "bank", accountNumber: "1234567890", ifsc: "SBIN0001234", name: "A" }, narration: "n", contactReference: "c",
    })).rejects.toThrow(PayoutRejectedError);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.mode).toBe("IMPS");
    expect(body.fund_account.bank_account).toEqual({ name: "A", ifsc: "SBIN0001234", account_number: "1234567890" });
  });

  it("parses signed payout webhooks and rejects unsigned ones", () => {
    const p = new RazorpayXPayoutProvider(cfg);
    const body = JSON.stringify({ event: "payout.processed", payload: { payout: { entity: { id: "pout_1", utr: "UTR123" } } } });
    const ev = p.parseWebhook(body, { "x-razorpay-signature": hmacSha256Hex("whx", body), "x-razorpay-event-id": "ev_9" });
    expect(ev).toEqual({ eventId: "ev_9", providerPayoutId: "pout_1", status: "paid", utr: "UTR123", reason: null });
    const failed = JSON.stringify({ event: "payout.reversed", payload: { payout: { entity: { id: "pout_2", failure_reason: "Account closed" } } } });
    expect(p.parseWebhook(failed, { "x-razorpay-signature": hmacSha256Hex("whx", failed) })).toMatchObject({ status: "failed", reason: "Account closed" });
    expect(() => p.parseWebhook(body, { "x-razorpay-signature": hmacSha256Hex("wrong", body) })).toThrow(InvalidSignatureError);
  });

  it("refuses to start without keys", () => {
    expect(() => createPayoutProvider({ PAYOUT_PROVIDER: "razorpayx" })).toThrow(/RAZORPAYX_ACCOUNT_NUMBER/);
    expect(createPayoutProvider({})).toBeInstanceOf(ManualPayoutProvider);
  });
});
