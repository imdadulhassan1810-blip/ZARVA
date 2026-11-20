import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { homeTotals, istInstant, type HomeBooking, type HomeService } from "@zarva/core";
import { setupTestApp } from "./helpers";

// Monday 23 Nov 2026, 09:00 IST. First bookable slot is 11:00 IST (2 h lead time).
const START = new Date("2026-11-23T03:30:00.000Z");
const clock = { t: START.getTime() };
const ADMIN = "9999900000";
let t: Awaited<ReturnType<typeof setupTestApp>>;
// OTP has a 30 s resend gap per number, so sign each test phone in once per test.
let sessions: Map<string, Promise<Session>>;
const login = (phone = "9876543210") => {
  if (!sessions.has(phone)) sessions.set(phone, t.login(phone));
  return sessions.get(phone)!;
};

beforeEach(async () => {
  sessions = new Map();
  clock.t = START.getTime();
  t = await setupTestApp({ ENABLED_MODULES: "home", ADMIN_PHONES: ADMIN }, { now: () => new Date(clock.t) });
});
afterEach(async () => { await t.close(); });

const P = "/v1/m/home";
const slot = (hour: number, date = "2026-11-23") => istInstant(date, hour).toISOString();
const advance = (min: number) => { clock.t += min * 60_000; };

type Session = Awaited<ReturnType<typeof t.login>>;
async function req(method: "GET" | "POST" | "PATCH", url: string, s?: Session, payload?: unknown) {
  const r = await t.app.inject({ method, url, headers: s?.headers, payload: payload as object });
  return { status: r.statusCode, body: r.statusCode === 204 ? null : r.json() };
}

async function catalog() {
  const r = await req("GET", `${P}/catalog?city=durgapur`);
  const svc = (slug: string) => (r.body.services as HomeService[]).find((s) => s.slug === slug)!;
  const cat = (slug: string) => (r.body.categories as { id: string; slug: string }[]).find((c) => c.slug === slug)!;
  return { ...r.body, svc, cat };
}

async function addAddress(s: Session, pincode = "713216") {
  const r = await req("POST", "/v1/me/addresses", s, {
    name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode,
  });
  return r.body.address.id as string;
}

/** Creates an approved pro for the given category slugs. */
async function makePro(phone: string, cats: string[], name = "Subrata Mondal") {
  const c = await catalog();
  const s = await login(phone);
  const a = await req("POST", `${P}/pro/apply`, s, { name, cityId: "durgapur", categoryIds: cats.map((x) => c.cat(x).id), locality: "Benachity" });
  expect(a.status).toBe(201);
  const admin = await login(ADMIN);
  const ok = await req("PATCH", `${P}/admin/pros/${a.body.pro.id}`, admin, { status: "active" });
  expect(ok.body.pro.status).toBe("active");
  return s;
}

async function book(s: Session, opts: { services?: [string, number][]; hour?: number; payMode?: "online" | "after_service"; key?: string; addressId?: string } = {}) {
  const c = await catalog();
  const addressId = opts.addressId ?? (await addAddress(s));
  return req("POST", `${P}/bookings`, s, {
    cityId: "durgapur", addressId, slotStart: slot(opts.hour ?? 11),
    items: (opts.services ?? [["fan-repair", 1]]).map(([slug, qty]) => ({ serviceId: c.svc(slug).id, qty })),
    payMode: opts.payMode ?? "online", idempotencyKey: opts.key ?? `key-${Math.random().toString(36).slice(2)}`,
  });
}

async function payWithMock(s: Session, bookingId: string, orderId: string) {
  const m = await req("POST", `/v1/payments/mock/${orderId}/succeed`);
  return req("POST", `${P}/bookings/${bookingId}/payment/confirm`, s, m.body.confirmation);
}

describe("home services: catalogue", () => {
  it("shows Durgapur categories with prices; Asansol and Kolkata are coming soon", async () => {
    const cities = (await req("GET", `${P}/cities`)).body.cities;
    expect(cities.map((c: { id: string; active: boolean }) => [c.id, c.active])).toEqual([["durgapur", true], ["asansol", false], ["kolkata", false]]);
    const c = await catalog();
    expect(c.categories.length).toBe(8);
    expect(c.svc("ac-service").pricePaise).toBe(49900);
    expect(c.categories.every((x: { serviceCount: number }) => x.serviceCount > 0)).toBe(true);
    const asansol = await req("GET", `${P}/catalog?city=asansol`);
    expect(asansol.status).toBe(400);
    expect(asansol.body.error.code).toBe("city_not_live");
  });

  it("totals add a ₹29 fee below ₹299 and none above", () => {
    expect(homeTotals([{ unitPricePaise: 19900, qty: 1 }])).toEqual({ subtotalPaise: 19900, feePaise: 2900, totalPaise: 22800 });
    expect(homeTotals([{ unitPricePaise: 19900, qty: 2 }])).toEqual({ subtotalPaise: 39800, feePaise: 0, totalPaise: 39800 });
  });
});

describe("home services: slots", () => {
  it("starts 2 hours ahead, runs 7 days, and has no slots when no pro covers the category", async () => {
    const c = await catalog();
    const none = (await req("GET", `${P}/slots?city=durgapur&categoryId=${c.cat("electrician").id}`)).body.days;
    expect(none).toHaveLength(7);
    expect(none[0].label).toMatch(/^Today/);
    expect(none[0].slots[0]).toMatchObject({ start: slot(11), label: "11 AM – 12 PM", available: false });

    await makePro("9000000001", ["electrician"]);
    const days = (await req("GET", `${P}/slots?city=durgapur&categoryId=${c.cat("electrician").id}`)).body.days;
    expect(days[0].slots[0].available).toBe(true);
    expect(days[1].slots).toHaveLength(12); // 8 AM .. 7 PM
  });

  it("one pro = one booking per slot; the next customer is told the slot is full", async () => {
    await makePro("9000000001", ["electrician"]);
    const a = await login("9876500001");
    const b = await login("9876500002");
    expect((await book(a, { payMode: "after_service" })).status).toBe(201);
    const second = await book(b, { payMode: "after_service" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("slot_full");
    const c = await catalog();
    const days = (await req("GET", `${P}/slots?city=durgapur&categoryId=${c.cat("electrician").id}`)).body.days;
    expect(days[0].slots[0].available).toBe(false);
    expect(days[0].slots[1].available).toBe(true);
  });

  it("an unpaid online booking holds the slot for 15 minutes only", async () => {
    await makePro("9000000001", ["electrician"]);
    const a = await login("9876500001");
    const b = await login("9876500002");
    expect((await book(a, { hour: 14 })).body.booking.status).toBe("pending_payment");
    expect((await book(b, { hour: 14 })).status).toBe(409);
    advance(16);
    expect((await book(b, { hour: 14 })).status).toBe(201);
  });
});

describe("home services: booking", () => {
  it("online: book -> pay -> confirmed, with the right total and a start code", async () => {
    await makePro("9000000001", ["electrician"]);
    const s = await login();
    const r = await book(s, { services: [["fan-repair", 1], ["fan-installation", 1]] });
    expect(r.status).toBe(201);
    const b: HomeBooking = r.body.booking;
    expect(b).toMatchObject({ status: "pending_payment", subtotalPaise: 34800, feePaise: 0, totalPaise: 34800, paid: false, categoryName: "Electrician" });
    expect(b.code).toMatch(/^ZH-[2-9A-Z]{6}$/);
    expect(b.startCode).toMatch(/^\d{4}$/);
    expect(r.body.payment.clientPayload.amount).toBe(34800);

    const done = await payWithMock(s, b.id, r.body.payment.clientPayload.order_id);
    expect(done.body.booking).toMatchObject({ status: "confirmed", paid: true });
    expect(done.body.booking.events.map((e: { note: string }) => e.note)).toContain("Payment received");
  });

  it("the payment webhook alone confirms the booking (app closed after paying)", async () => {
    await makePro("9000000001", ["electrician"]);
    const s = await login();
    const r = await book(s);
    const orderId = r.body.payment.clientPayload.order_id;
    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId, paymentId: "pay_1", amount: r.body.booking.totalPaise });
    const w = await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    expect(w.statusCode).toBe(200);
    expect((await req("GET", `${P}/bookings/${r.body.booking.id}`, s)).body.booking.status).toBe("confirmed");
  });

  it("a failed payment keeps the booking unpaid and lets the customer retry", async () => {
    await makePro("9000000001", ["electrician"]);
    const s = await login();
    const r = await book(s);
    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.failed", orderId: r.body.payment.clientPayload.order_id });
    await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
    const retry = await req("POST", `${P}/bookings/${r.body.booking.id}/pay`, s);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.id).not.toBe(r.body.payment.id);
    const done = await payWithMock(s, r.body.booking.id, retry.body.payment.clientPayload.order_id);
    expect(done.body.booking.status).toBe("confirmed");
  });

  it("double-tap with the same key returns the same booking and one payment", async () => {
    await makePro("9000000001", ["electrician"]);
    const s = await login();
    const addressId = await addAddress(s);
    const a = await book(s, { key: "same-key-123", addressId });
    const b = await book(s, { key: "same-key-123", addressId });
    expect(b.body.booking.id).toBe(a.body.booking.id);
    expect(b.body.payment.id).toBe(a.body.payment.id);
    expect((await req("GET", `${P}/bookings`, s)).body.bookings).toHaveLength(1);
  });

  it("rejects bad input: other user's address, PIN outside Durgapur, mixed categories, bad slot", async () => {
    await makePro("9000000001", ["electrician", "plumber"]);
    const me = await login("9876500001");
    const other = await login("9876500002");
    const otherAddr = await addAddress(other);
    expect((await book(me, { addressId: otherAddr })).status).toBe(404);

    const far = await book(me, { addressId: await addAddress(me, "700091") });
    expect(far.body.error.code).toBe("not_serviceable");

    const mixed = await book(me, { services: [["fan-repair", 1], ["tap-repair", 1]] });
    expect(mixed.body.error.code).toBe("mixed_categories");

    expect((await book(me, { hour: 10 })).body.error.code).toBe("invalid_slot"); // inside 2 h lead
    expect((await book(me, { hour: 21 })).body.error.code).toBe("invalid_slot"); // after hours
  });

  it("customers only see their own bookings", async () => {
    await makePro("9000000001", ["electrician"]);
    const me = await login("9876500001");
    const other = await login("9876500002");
    const r = await book(me, { payMode: "after_service" });
    expect((await req("GET", `${P}/bookings/${r.body.booking.id}`, other)).status).toBe(404);
    expect((await req("POST", `${P}/bookings/${r.body.booking.id}/cancel`, other, {})).status).toBe(404);
  });

  it("cancelling a paid booking refunds in full; cancelling inside 2 hours is refused", async () => {
    await makePro("9000000001", ["electrician"]);
    const s = await login();
    const r = await book(s, { hour: 15 });
    const orderId = r.body.payment.clientPayload.order_id;
    await payWithMock(s, r.body.booking.id, orderId);
    const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId, paymentId: "pay_1", amount: r.body.booking.totalPaise });
    await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });

    const c = await req("POST", `${P}/bookings/${r.body.booking.id}/cancel`, s, { reason: "Plans changed" });
    expect(c.body.booking).toMatchObject({ status: "cancelled", refundedPaise: r.body.booking.totalPaise, canCancel: false });
    const pay = await req("GET", `/v1/payments/${r.body.booking.paymentId}`, s);
    expect(pay.body.payment.status).toBe("refunded");

    const late = await book(s, { hour: 16, payMode: "after_service" });
    expect(late.body.booking.canCancel).toBe(true);
    advance(5 * 60); // 14:00 IST, slot at 16:00 is exactly 2 h away
    advance(1);
    const refused = await req("POST", `${P}/bookings/${late.body.booking.id}/cancel`, s, {});
    expect(refused.body.error.code).toBe("cannot_cancel");
  });
});

describe("home services: professionals", () => {
  it("pending pros see nothing; approved pros accept, travel, start with the code and complete", async () => {
    const c = await catalog();
    const proS = await login("9000000001");
    await req("POST", `${P}/pro/apply`, proS, { name: "Subrata Mondal", cityId: "durgapur", categoryIds: [c.cat("electrician").id] });
    expect((await req("GET", `${P}/pro/jobs`, proS)).status).toBe(403);
    const admin = await login(ADMIN);
    const pros = (await req("GET", `${P}/admin/pros`, admin)).body.pros;
    await req("PATCH", `${P}/admin/pros/${pros[0].id}`, admin, { status: "active" });

    const cust = await login("9876500001");
    const b: HomeBooking = (await book(cust, { payMode: "after_service" })).body.booking;
    expect(b.status).toBe("confirmed");

    const jobs = (await req("GET", `${P}/pro/jobs`, proS)).body;
    expect(jobs.available).toHaveLength(1);
    // Before accepting, the pro sees the area but not the customer's name, phone or house.
    expect(jobs.available[0].address).toMatchObject({ name: "", phone: "", line1: "", line2: "Benachity", pincode: "713216" });
    expect(jobs.available[0].startCode).toBeUndefined();

    const acc = await req("POST", `${P}/pro/jobs/${b.id}/accept`, proS);
    expect(acc.body.booking).toMatchObject({ status: "assigned", address: { name: "Riya Sen", line1: "12 Nehru Avenue" } });
    expect(acc.body.booking.startCode).toBeUndefined();

    const custView = (await req("GET", `${P}/bookings/${b.id}`, cust)).body.booking;
    expect(custView.pro).toEqual({ name: "Subrata Mondal", phone: "+919000000001" });

    const st = (status: string, startCode?: string) => req("POST", `${P}/pro/jobs/${b.id}/status`, proS, { status, startCode });
    expect((await st("completed")).body.error.code).toBe("invalid_transition");
    expect((await st("on_the_way")).body.booking.status).toBe("on_the_way");
    const wrong = b.startCode === "0000" ? "1111" : "0000";
    expect((await st("in_progress", wrong)).body.error.code).toBe("wrong_start_code");
    expect((await st("in_progress", b.startCode)).body.booking.status).toBe("in_progress");
    const done = (await st("completed")).body.booking;
    expect(done).toMatchObject({ status: "completed", paid: true });
    expect(done.events.at(-1).note).toMatch(/collected by professional/);
    expect((await req("GET", `${P}/pro/me`, proS)).body.pro.jobsDone).toBe(1);
  });

  it("two pros race for one job: exactly one gets it", async () => {
    const p1 = await makePro("9000000001", ["electrician"], "Pro One");
    const p2 = await makePro("9000000002", ["electrician"], "Pro Two");
    const cust = await login("9876500001");
    const b = (await book(cust, { payMode: "after_service" })).body.booking;
    const [r1, r2] = await Promise.all([
      req("POST", `${P}/pro/jobs/${b.id}/accept`, p1),
      req("POST", `${P}/pro/jobs/${b.id}/accept`, p2),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it("a pro can't hold two jobs in the same slot", async () => {
    const p1 = await makePro("9000000001", ["electrician"], "Pro One");
    await makePro("9000000002", ["electrician"], "Pro Two");
    const a = await login("9876500001");
    const b = await login("9876500002");
    const j1 = (await book(a, { payMode: "after_service" })).body.booking;
    const j2 = (await book(b, { payMode: "after_service" })).body.booking;
    expect((await req("POST", `${P}/pro/jobs/${j1.id}/accept`, p1)).status).toBe(200);
    const clash = await req("POST", `${P}/pro/jobs/${j2.id}/accept`, p1);
    expect(clash.body.error.code).toBe("slot_clash");
  });

  it("a pro never sees jobs outside their categories", async () => {
    const elec = await makePro("9000000001", ["electrician"]);
    await makePro("9000000004", ["plumber"], "Bapi Bauri");
    const cust = await login("9876500001");
    const b = (await book(cust, { services: [["tap-repair", 2]], payMode: "after_service" })).body.booking;
    expect((await req("GET", `${P}/pro/jobs`, elec)).body.available).toHaveLength(0);
    expect((await req("POST", `${P}/pro/jobs/${b.id}/accept`, elec)).status).toBe(404);
  });
});

describe("home services: admin", () => {
  it("is admins only", async () => {
    const s = await login("9876500001");
    expect((await req("GET", `${P}/admin/bookings`, s)).status).toBe(403);
    expect((await req("GET", `${P}/admin/bookings`)).status).toBe(401);
  });

  it("changes a price, assigns a pro and cancels with a reason", async () => {
    await makePro("9000000001", ["electrician"]);
    const admin = await login(ADMIN);
    const c = await catalog();
    const upd = await req("PATCH", `${P}/admin/services/${c.svc("fan-repair").id}`, admin, { pricePaise: 22900 });
    expect(upd.body.service.pricePaise).toBe(22900);
    expect((await catalog()).svc("fan-repair").pricePaise).toBe(22900);

    const cust = await login("9876500001");
    const b = (await book(cust, { payMode: "after_service" })).body.booking;
    expect(b.totalPaise).toBe(22900 + 2900);

    const pros = (await req("GET", `${P}/admin/pros`, admin)).body.pros;
    const as = await req("POST", `${P}/admin/bookings/${b.id}/assign`, admin, { proId: pros[0].id });
    expect(as.body.booking.status).toBe("assigned");

    const list = await req("GET", `${P}/admin/bookings?status=assigned`, admin);
    expect(list.body.bookings).toHaveLength(1);

    const cx = await req("POST", `${P}/admin/bookings/${b.id}/cancel`, admin, { reason: "Customer called to cancel" });
    expect(cx.body.booking.status).toBe("cancelled");
  });
});

describe("home services: phone required", () => {
  it("a Google account without a phone cannot book, even pay-after-service, until it adds one", async () => {
    await makePro("9000000001", ["electrician"]);
    const g = await t.app.inject({ method: "POST", url: "/v1/auth/google", payload: { idToken: "mock:riya@gmail.com:Riya Sen" } });
    const body = g.json();
    const s = { ...body, headers: { authorization: `Bearer ${body.accessToken}` } } as Session;
    const r = await book(s, { payMode: "after_service" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("phone_required");

    await req("POST", "/v1/me/phone/request", s, { phone: "9876543210" });
    await req("POST", "/v1/me/phone/verify", s, { phone: "9876543210", code: t.otp.last.get("+919876543210") });
    const ok = await book(s, { payMode: "after_service" });
    expect(ok.status).toBe(201);
  });
});
