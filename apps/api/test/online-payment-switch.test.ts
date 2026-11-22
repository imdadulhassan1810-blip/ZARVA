import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/lib/config";
import { setupTestApp } from "./helpers";

const LIVE = {
  NODE_ENV: "production", OTP_PROVIDER: "msg91", EMAIL_PROVIDER: "resend", PAYMENT_PROVIDER: "razorpay",
  JWT_SECRET: "a-real-secret-a-real-secret-a-real-secret", SMS_PROVIDER: "off", WHATSAPP_PROVIDER: "off",
  KYC_ENCRYPTION_KEY: "a-real-kyc-key-a-real-kyc-key-a-real-kyc-key", PUBLIC_WEB_URL: "https://zarva.in", CORS_ORIGINS: "https://zarva.in",
  DATABASE_URL: "postgres://db/zarva",
};

describe("'Pay online' is off on a live server with Razorpay test keys", () => {
  it("config: test keys on a live server switch it off; live keys, or an explicit test site, switch it on", () => {
    expect(loadConfig({ ...LIVE, RAZORPAY_KEY_ID: "rzp_test_abc" }).onlinePayments).toBe(false);
    expect(loadConfig({ ...LIVE, RAZORPAY_KEY_ID: "rzp_live_abc" }).onlinePayments).toBe(true);
    expect(loadConfig({ ...LIVE, RAZORPAY_KEY_ID: "rzp_test_abc", ALLOW_TEST_PAYMENTS: "true" }).onlinePayments).toBe(true);
    // A developer's machine can try Razorpay test mode.
    expect(loadConfig({ NODE_ENV: "development", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_abc" }).onlinePayments).toBe(true);
    expect(loadConfig({ NODE_ENV: "development" }).onlinePayments).toBe(true);
  });

  let t: Awaited<ReturnType<typeof setupTestApp>>;
  afterEach(async () => { await t?.close(); });

  it("the catalogue tells the apps, and the API refuses an online booking", async () => {
    t = await setupTestApp({ ...LIVE, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://zarva:zarva@localhost:5432/zarva_test", RAZORPAY_KEY_ID: "rzp_test_abc" });
    const cat = (await t.app.inject({ method: "GET", url: "/v1/m/home/catalog?city=durgapur" })).json();
    expect(cat.onlinePayment).toBe(false);

    const s = await t.login("9876543210");
    const addr = await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: s.headers, payload: {
      name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode: "713216",
    } });
    // Any service above the minimum order (services with equal sort come back in no fixed order).
    const service = cat.services.find((x: { pricePaise: number }) => x.pricePaise >= 9900);
    const days = (await t.app.inject({ method: "GET", url: `/v1/m/home/slots?city=durgapur&categoryId=${service.categoryId}` })).json().days;
    const r = await t.app.inject({ method: "POST", url: "/v1/m/home/bookings", headers: s.headers, payload: {
      cityId: "durgapur", addressId: addr.json().address.id, slotStart: days[1].slots[0].start,
      items: [{ serviceId: service.id, qty: 1 }], payMode: "online", idempotencyKey: "k-online-off",
    } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("online_payment_off");
  });
});
