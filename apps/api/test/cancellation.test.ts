import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_HOME_POLICY, homeRefundQuote, istInstant, partnerPenaltyBps, splitGst, type HomeBooking, type HomeService } from "@zarva/core";
import { completeKyc, setupTestApp } from "./helpers";

// Monday 23 Nov 2026, 09:00 IST. First bookable slot is 11:00 IST (2 h lead time).
const START = new Date("2026-11-23T03:30:00.000Z");
const clock = { t: START.getTime() };
let t: Awaited<ReturnType<typeof setupTestApp>>;
let sessions: Map<string, Promise<Session>>;
const login = (phone = "9876543210") => {
  if (!sessions.has(phone)) sessions.set(phone, (phone === "admin" ? t.loginAdmin() : t.login(phone, phone.startsWith("90000") ? "partner" : "customer")) as Promise<Session>);
  return sessions.get(phone)!;
};

beforeEach(async () => {
  sessions = new Map();
  clock.t = START.getTime();
  t = await setupTestApp({ ENABLED_MODULES: "home" }, { now: () => new Date(clock.t) });
});
afterEach(async () => { await t.close(); });

const P = "/v1/m/home";
const advance = (min: number) => { clock.t += min * 60_000; };
type Session = Awaited<ReturnType<typeof t.login>>;
async function req(method: "GET" | "POST" | "PATCH" | "PUT", url: string, s?: Session, payload?: unknown) {
  const r = await t.app.inject({ method, url, headers: s?.headers, payload: payload as object });
  return { status: r.statusCode, body: r.json() };
}
async function catalog() {
  const r = await req("GET", `${P}/catalog?city=durgapur`);
  return {
    ...r.body,
    svc: (slug: string) => (r.body.services as HomeService[]).find((s) => s.slug === slug)!,
    cat: (slug: string) => (r.body.categories as { id: string; slug: string }[]).find((c) => c.slug === slug)!,
  };
}
async function makePro(phone = "9000000001") {
  const c = await catalog();
  const s = await login(phone);
  const a = await req("POST", `${P}/pro/apply`, s, { name: "Subrata Mondal", cityId: "durgapur", categoryIds: [c.cat("electrician").id] });
  await completeKyc(t.app, s.headers);
  await req("PATCH", `${P}/admin/pros/${a.body.pro.id}`, await login("admin"), { status: "active" });
  return s;
}
/** Books fan repair (quote ₹199; customer pays ₹268.76), pays with the mock checkout and settles the payment. */
async function bookPaid(s: Session, hour: number, date = "2026-11-23"): Promise<HomeBooking> {
  const c = await catalog();
  const addr = await req("POST", "/v1/me/addresses", s, {
    name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode: "713216",
  });
  const r = await req("POST", `${P}/bookings`, s, {
    cityId: "durgapur", addressId: addr.body.address.id, slotStart: istInstant(date, hour).toISOString(),
    items: [{ serviceId: c.svc("fan-repair").id, qty: 1 }], payMode: "online", idempotencyKey: `k-${Math.random()}`,
  });
  expect(r.status).toBe(201);
  const orderId = r.body.payment.clientPayload.order_id;
  const m = await req("POST", `/v1/payments/mock/${orderId}/succeed`);
  await req("POST", `${P}/bookings/${r.body.booking.id}/payment/confirm`, s, m.body.confirmation);
  // Money is refundable once captured (Razorpay auto-capture sends this webhook).
  const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId, paymentId: `pay_${Math.random()}`, amount: r.body.booking.totalPaise });
  await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
  return (await req("GET", `${P}/bookings/${r.body.booking.id}`, s)).body.booking;
}

describe("refund maths", () => {
  it("legacy bookings: splits GST out of the inclusive price and refunds base and GST in the same share; fee never", () => {
    expect(splitGst(19900)).toEqual({ basePaise: 16864, gstPaise: 3036 });
    const q = homeRefundQuote({ subtotalPaise: 19900, feePaise: 2900, totalPaise: 22800 }, 6 * 60, DEFAULT_HOME_POLICY);
    expect(q).toMatchObject({ refundBps: 7500, baseRefundPaise: 12648, gstRefundPaise: 2277, refundPaise: 14925, feeKeptPaise: 2900, chargePaise: 7875 });
    expect(homeRefundQuote({ subtotalPaise: 19900, feePaise: 2900, totalPaise: 22800 }, 24 * 60, DEFAULT_HOME_POLICY).refundPaise).toBe(19900);
    expect(homeRefundQuote({ subtotalPaise: 19900, feePaise: 0, totalPaise: 19900 }, 89, DEFAULT_HOME_POLICY).refundPaise).toBe(0);
  });
  it("partner penalty: none for 2 a day, then 10%, 12.5%, 15%", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => partnerPenaltyBps(DEFAULT_HOME_POLICY, n))).toEqual([0, 0, 1000, 1250, 1500, 1500]);
  });
});

describe("prepaid only", () => {
  it("refuses pay after service and tells the apps", async () => {
    await makePro();
    const cat = await catalog();
    expect(cat.prepaidOnly).toBe(true);
    expect(cat.policy.customerCutoffMinutes).toBe(90);
    const s = await login();
    const addr = await req("POST", "/v1/me/addresses", s, {
      name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode: "713216",
    });
    const r = await req("POST", `${P}/bookings`, s, {
      cityId: "durgapur", addressId: addr.body.address.id, slotStart: istInstant("2026-11-23", 12).toISOString(),
      items: [{ serviceId: cat.svc("fan-repair").id, qty: 1 }], payMode: "after_service", idempotencyKey: "k-cash-after-service",
    });
    expect(r.status).toBe(400);
    expect(r.body.error, JSON.stringify(r.body)).toMatchObject({ code: "prepaid_only" });
  });
});

describe("customer cancellation", () => {
  it("shows the refund before confirming, refuses a stale amount, then refunds base + GST by the slab and keeps the fee", async () => {
    await makePro();
    const s = await login();
    const b = await bookPaid(s, 15); // 6 hours ahead: 75% slab
    expect(b.cancelInfo).toMatchObject({ canCancel: true, canReschedule: true, cancelBlock: null, reschedulesLeft: 2 });
    // 75% of base ₹208.95 and of its GST ₹37.61, each rounded down; charges ₹22.20 (₹12.54 + ₹6.27 + their GST ₹3.39) kept.
    expect(b.cancelInfo!.quote).toMatchObject({ refundBps: 7500, baseRefundPaise: 15671, gstRefundPaise: 2820, refundPaise: 18491, feeKeptPaise: 2220, chargePaise: 8385 });

    advance(1); // now 5 h 59 min ahead: the 50% slab
    const q = (await req("GET", `${P}/bookings/${b.id}/cancel-quote`, s)).body.cancelInfo;
    expect(q.quote.refundBps).toBe(5000);
    const stale = await req("POST", `${P}/bookings/${b.id}/cancel`, s, { reason: "Plans changed", expectedRefundPaise: 18491 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("quote_changed");

    const c = await req("POST", `${P}/bookings/${b.id}/cancel`, s, { reason: "Plans changed", expectedRefundPaise: q.quote.refundPaise });
    expect(c.body.booking).toMatchObject({ status: "cancelled", refundedPaise: 12327, canCancel: false });
    expect(c.body.booking.cancellation).toMatchObject({ by: "customer", minutesBefore: 359, quote: { baseRefundPaise: 10447, gstRefundPaise: 1880 } });
    const pay = await req("GET", `/v1/payments/${b.paymentId}`, s);
    expect(pay.body.payment).toMatchObject({ status: "partially_refunded", refundedPaise: 12327 });
    expect((await t.messages()).find((m) => m.event === "refund_started")!.text).toContain("₹123.27");
  });

  it("24 hours or more ahead: the whole service price back, fee kept", async () => {
    await makePro();
    const s = await login();
    const b = await bookPaid(s, 11, "2026-11-24");
    const c = await req("POST", `${P}/bookings/${b.id}/cancel`, s, {});
    expect(c.body.booking.refundedPaise).toBe(20895 + 3761);
  });

  it("no cancel or reschedule less than 90 minutes before the slot", async () => {
    await makePro();
    const s = await login();
    const b = await bookPaid(s, 11); // 2 h ahead
    advance(30); // exactly 90 min ahead: still allowed, 25%
    let info = (await req("GET", `${P}/bookings/${b.id}/cancel-quote`, s)).body.cancelInfo;
    expect(info).toMatchObject({ canCancel: true, canReschedule: true, quote: { refundBps: 2500 } });
    advance(1);
    info = (await req("GET", `${P}/bookings/${b.id}/cancel-quote`, s)).body.cancelInfo;
    expect(info).toMatchObject({ canCancel: false, canReschedule: false, cancelBlock: "too_late", rescheduleBlock: "too_late" });
    const cx = await req("POST", `${P}/bookings/${b.id}/cancel`, s, {});
    expect(cx.body.error.code).toBe("cannot_cancel");
    expect(cx.body.error.message).toMatch(/90 minutes/);
    const rs = await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 11).toISOString() });
    expect(rs.body.error.code).toBe("cannot_reschedule");
  });

  it("an admin cancellation refunds everything, fee included", async () => {
    await makePro();
    const s = await login();
    const b = await bookPaid(s, 12);
    const c = await req("POST", `${P}/admin/bookings/${b.id}/cancel`, await login("admin"), { reason: "No professional available" });
    expect(c.body.booking).toMatchObject({ status: "cancelled", refundedPaise: 26876, cancellation: { by: "admin" } });
  });
});

describe("customer reschedule", () => {
  it("is free, frees the assigned pro, tells both, and is limited to 2 per booking", async () => {
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 12);
    await req("POST", `${P}/pro/jobs/${b.id}/accept`, pro);
    await t.messages();

    const r1 = await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 10).toISOString() });
    expect(r1.body.booking).toMatchObject({ status: "confirmed", pro: null, rescheduleCount: 1, totalPaise: 26876, refundedPaise: 0, slotStart: istInstant("2026-11-24", 10).toISOString() });
    const msgs = await t.messages();
    expect(msgs.find((m) => m.event === "booking_rescheduled")!.text).toContain("moved to 24 Nov, 10 AM");
    expect(msgs.find((m) => m.event === "pro_job_cancelled")).toMatchObject({ to: "+919000000001" });
    // Back in the job list for the new time.
    expect((await req("GET", `${P}/pro/jobs`, pro)).body.available.map((j: HomeBooking) => j.id)).toEqual([b.id]);

    expect((await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 10).toISOString() })).body.error.code).toBe("same_slot");
    expect((await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 11).toISOString() })).status).toBe(200);
    const third = await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 12).toISOString() });
    expect(third.body.error.code).toBe("cannot_reschedule");
    const after = (await req("GET", `${P}/bookings/${b.id}`, s)).body.booking;
    expect(after.cancelInfo).toMatchObject({ canReschedule: false, rescheduleBlock: "reschedule_limit", canCancel: true });
  });

  it("can't move into a full slot", async () => {
    await makePro();
    const a = await login("9876500001");
    const b2 = await login("9876500002");
    await bookPaid(a, 14);
    const mine = await bookPaid(b2, 15);
    const r = await req("POST", `${P}/bookings/${mine.id}/reschedule`, b2, { slotStart: istInstant("2026-11-23", 14).toISOString() });
    expect(r.body.error.code).toBe("slot_full");
  });
});

describe("admin cancellation rules", () => {
  it("admins edit the rules; bad rules are refused; new rules apply to the next quote", async () => {
    await makePro();
    const admin = await login("admin");
    const cust = await login();
    expect((await req("GET", `${P}/admin/policy`, cust)).status).toBe(403);
    const cur = (await req("GET", `${P}/admin/policy`, admin)).body.policy;
    expect(cur).toEqual(DEFAULT_HOME_POLICY);

    const bad = await req("PUT", `${P}/admin/policy`, admin, { ...cur, refundSlabs: [{ minMinutesBefore: 30, refundBps: 5000 }] });
    expect(bad.body.error.code).toBe("invalid_policy");

    const next = { ...cur, refundSlabs: [{ minMinutesBefore: 120, refundBps: 9000 }, { minMinutesBefore: 1440, refundBps: 10_000 }] };
    const ok = await req("PUT", `${P}/admin/policy`, admin, next);
    expect(ok.body.policy.refundSlabs[0]).toEqual({ minMinutesBefore: 1440, refundBps: 10_000 }); // sorted, longest notice first
    expect((await catalog()).policy.refundSlabs).toHaveLength(2);

    const b = await bookPaid(cust, 15);
    expect(b.cancelInfo!.quote!.refundBps).toBe(9000);
  });
});

describe("partner cancellation", () => {
  it("puts the job back for another pro, tells the customer, and counts toward the limits", async () => {
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 12);
    await req("POST", `${P}/pro/jobs/${b.id}/accept`, pro);
    await t.messages();

    expect((await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, {})).status).toBe(400); // reason required
    const c = await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, { reason: "Bike broke down" });
    expect(c.body.cancelStats).toMatchObject({ today: 1, week: 1, freePerDay: 2, maxPerWeek: 14, todayPenaltyBps: 0, nextPenaltyBps: 0, canCancel: true });
    const cust = (await req("GET", `${P}/bookings/${b.id}`, s)).body.booking;
    expect(cust).toMatchObject({ status: "confirmed", pro: null, refundedPaise: 0 });
    expect((await t.messages()).map((m) => m.event)).toContain("pro_changed");
    expect((await req("GET", `${P}/pro/jobs`, pro)).body.available).toHaveLength(1);
  });

  it("can't cancel a job once started", async () => {
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 12);
    await req("POST", `${P}/pro/jobs/${b.id}/accept`, pro);
    await req("POST", `${P}/pro/jobs/${b.id}/status`, pro, { status: "on_the_way" });
    await req("POST", `${P}/pro/jobs/${b.id}/status`, pro, { status: "in_progress", startCode: b.startCode });
    expect((await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, { reason: "Too far" })).body.error.code).toBe("cannot_cancel");
  });

  it("more than 2 in a day takes 10% of that day's earnings off the next payout", async () => {
    const pro = await makePro();
    const s = await login();
    const done = await bookPaid(s, 11);
    const jobs = [await bookPaid(s, 12), await bookPaid(s, 13), await bookPaid(s, 14)];
    for (const j of [done, ...jobs]) expect((await req("POST", `${P}/pro/jobs/${j.id}/accept`, pro)).status).toBe(200);
    await req("POST", `${P}/pro/jobs/${done.id}/status`, pro, { status: "on_the_way" });
    await req("POST", `${P}/pro/jobs/${done.id}/status`, pro, { status: "in_progress", startCode: done.startCode });
    await req("POST", `${P}/pro/jobs/${done.id}/status`, pro, { status: "completed" }); // earns ₹199 - 10% = ₹179.10

    let stats = (await req("POST", `${P}/pro/jobs/${jobs[0]!.id}/cancel`, pro, { reason: "Family emergency" })).body.cancelStats;
    stats = (await req("POST", `${P}/pro/jobs/${jobs[1]!.id}/cancel`, pro, { reason: "Family emergency" })).body.cancelStats;
    expect(stats).toMatchObject({ today: 2, todayPenaltyBps: 0, nextPenaltyBps: 1000 });
    stats = (await req("POST", `${P}/pro/jobs/${jobs[2]!.id}/cancel`, pro, { reason: "Family emergency" })).body.cancelStats;
    expect(stats).toMatchObject({ today: 3, todayPenaltyBps: 1000, nextPenaltyBps: 1250 });

    // Same day: the penalty isn't written yet (the day's earnings aren't final).
    let e = (await req("GET", `${P}/pro/earnings`, pro)).body;
    expect(e.balancePaise).toBe(17910);
    expect(e.cancelStats.today).toBe(3);

    advance(15 * 60 + 1); // 00:01 IST Tuesday
    e = (await req("GET", `${P}/pro/earnings`, pro)).body;
    expect(e.entries[0]).toMatchObject({ kind: "cancellation_penalty", amountPaise: -1791 });
    expect(e.entries[0].note).toContain("3 jobs cancelled on 2026-11-23: 10%");
    expect(e.balancePaise).toBe(17910 - 1791);
    expect(e.penaltiesWeekPaise).toBe(1791);
    expect(e.cancelStats).toMatchObject({ today: 0, week: 3 });

    // Settling again changes nothing; the admin payout list shows the same balance.
    const payouts = (await req("GET", `${P}/admin/payouts`, (await t.loginAdmin()) as unknown as Session)).body;
    expect(payouts.pros, JSON.stringify(payouts)).toBeDefined();
    const bal = payouts.pros[0];
    expect(bal.balancePaise).toBe(17910 - 1791);
  });

  it("blocks cancelling once the weekly limit is reached", async () => {
    const admin = await login("admin");
    const cur = (await req("GET", `${P}/admin/policy`, admin)).body.policy;
    await req("PUT", `${P}/admin/policy`, admin, { ...cur, partnerMaxCancelsPerWeek: 1 });
    const pro = await makePro();
    const s = await login();
    const a = await bookPaid(s, 12);
    const b = await bookPaid(s, 13);
    await req("POST", `${P}/pro/jobs/${a.id}/accept`, pro);
    await req("POST", `${P}/pro/jobs/${b.id}/accept`, pro);
    expect((await req("POST", `${P}/pro/jobs/${a.id}/cancel`, pro, { reason: "Not well" })).body.cancelStats.canCancel).toBe(false);
    const r = await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, { reason: "Not well" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("weekly_cancel_limit");
  });
});
