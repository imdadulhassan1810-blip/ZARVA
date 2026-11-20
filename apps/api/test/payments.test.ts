import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeEach(async () => { t = await setupTestApp(); });
afterEach(async () => { await t.close(); });

async function newPayment(userId: string, key = "k1", amountPaise = 49900) {
  return t.app.services.payments.createForOrder({ userId, module: "home", referenceId: "booking_1", amountPaise, idempotencyKey: key });
}

describe("payments", () => {
  it("full happy path: create -> client confirm -> webhook capture", async () => {
    const s = await t.login();
    const { payment } = await newPayment(s.user.id);
    expect(payment.status).toBe("created");

    const conf = t.provider.simulateSuccess(payment.providerOrderId!);
    const c = await t.app.inject({ method: "POST", url: "/v1/payments/confirm", headers: s.headers, payload: conf });
    expect(c.json().payment.status).toBe("authorized");

    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId: payment.providerOrderId, paymentId: conf.providerPaymentId, amount: 49900 });
    const w = await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    expect(w.json()).toEqual({ ok: true, duplicate: false });

    const g = await t.app.inject({ method: "GET", url: `/v1/payments/${payment.id}`, headers: s.headers });
    expect(g.json().payment).toMatchObject({ status: "captured", method: "upi", amountPaise: 49900 });

    // Provider retries the same webhook: ignored.
    const again = await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    expect(again.json().duplicate).toBe(true);
  });

  it("same idempotency key never creates a second charge", async () => {
    const s = await t.login();
    const a = await newPayment(s.user.id);
    const b = await newPayment(s.user.id);
    expect(b.payment.id).toBe(a.payment.id);
    await expect(newPayment(s.user.id, "k1", 100000)).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("rejects forged client confirmations and unsigned webhooks", async () => {
    const s = await t.login();
    const { payment } = await newPayment(s.user.id);
    const c = await t.app.inject({ method: "POST", url: "/v1/payments/confirm", headers: s.headers, payload: { providerOrderId: payment.providerOrderId, providerPaymentId: "p", signature: "ab" } });
    expect(c.statusCode).toBe(400);
    const w = await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: { event: "payment.captured", orderId: payment.providerOrderId }, headers: { "x-mock-signature": "00" } });
    expect(w.statusCode).toBe(400);
  });

  it("refuses a captured amount different from what we charged", async () => {
    const s = await t.login();
    const { payment } = await newPayment(s.user.id);
    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId: payment.providerOrderId, paymentId: "p1", amount: 100 });
    const w = await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    expect(w.statusCode).toBe(422);
  });

  it("another user cannot read or confirm my payment", async () => {
    const me = await t.login("9876543210");
    const other = await t.login("9123456780");
    const { payment } = await newPayment(me.user.id);
    expect((await t.app.inject({ method: "GET", url: `/v1/payments/${payment.id}`, headers: other.headers })).statusCode).toBe(404);
    const conf = t.provider.simulateSuccess(payment.providerOrderId!);
    expect((await t.app.inject({ method: "POST", url: "/v1/payments/confirm", headers: other.headers, payload: conf })).statusCode).toBe(404);
  });

  it("partial then full refund, never more than paid", async () => {
    const s = await t.login();
    const { payment } = await newPayment(s.user.id);
    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId: payment.providerOrderId, paymentId: "p1", amount: 49900 });
    await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    expect((await t.app.services.payments.refund(payment.id, 9900)).status).toBe("partially_refunded");
    await expect(t.app.services.payments.refund(payment.id, 40001)).rejects.toMatchObject({ code: "invalid_amount" });
    expect((await t.app.services.payments.refund(payment.id, 40000)).status).toBe("refunded");
  });
});

describe("modules", () => {
  it("lists all five verticals and mounts only enabled ones", async () => {
    await t.close();
    t = await setupTestApp({ ENABLED_MODULES: "home" });
    const r = (await t.app.inject({ method: "GET", url: "/v1/modules" })).json().modules;
    expect(r.map((m: { id: string }) => m.id)).toEqual(["food", "shopping", "events", "travel", "home"]);
    expect(r.filter((m: { enabled: boolean }) => m.enabled).map((m: { id: string }) => m.id)).toEqual(["home"]);
    expect((await t.app.inject({ method: "GET", url: "/v1/m/home/status" })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: "/v1/m/food/status" })).statusCode).toBe(404);
  });
});
