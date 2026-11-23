import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { istInstant, type HomeBooking, type HomeService } from "@zarva/core";
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
  t = await setupTestApp({ ENABLED_MODULES: "home" }, { now: () => new Date(clock.t), autoAssign: true });
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
async function makePro(phone = "9000000001", name = "Subrata Mondal") {
  const c = await catalog();
  const s = await login(phone);
  const a = await req("POST", `${P}/pro/apply`, s, { name, cityId: "durgapur", categoryIds: [c.cat("electrician").id] });
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
  expect((await req("POST", `${P}/bookings/${r.body.booking.id}/payment/confirm`, s, m.body.confirmation)).status).toBe(200);
  // Money is refundable once captured (Razorpay auto-capture sends this webhook).
  const { rawBody, headers } = t.provider.signWebhook({ event: "payment.captured", orderId, paymentId: `pay_${Math.random()}`, amount: r.body.booking.totalPaise });
  await t.app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload: rawBody, headers: { ...headers, "content-type": "application/json" } });
  return (await req("GET", `${P}/bookings/${r.body.booking.id}`, s)).body.booking;
}


const proName = async (s: Session, id: string) => (await req("GET", `${P}/bookings/${id}`, s)).body.booking.pro?.name ?? null;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("auto-assign", () => {
  it("gives a paid booking straight to a free professional: no accept step, the pro is told by SMS", async () => {
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 15);
    expect(b).toMatchObject({ status: "assigned", pro: { name: "Subrata Mondal" } });
    const msgs = await t.messages();
    expect(msgs.find((m) => m.event === "pro_job_assigned")).toMatchObject({ to: "+919000000001" });
    expect(msgs.find((m) => m.event === "pro_assigned")).toBeTruthy();
    const jobs = (await req("GET", `${P}/pro/jobs`, pro)).body;
    expect(jobs.mine.map((j: HomeBooking) => j.id)).toEqual([b.id]);
    expect(jobs.available).toEqual([]);
  });

  it("spreads work: the pro with fewer jobs that day gets the next one", async () => {
    await makePro("9000000001", "Amit Das");
    await makePro("9000000002", "Bikash Roy");
    const s = await login();
    const a = await bookPaid(s, 14);
    const b = await bookPaid(s, 16);
    expect(new Set([a.pro?.name, b.pro?.name])).toEqual(new Set(["Amit Das", "Bikash Roy"]));
  });

  it("skips pros who are switched off or not working that hour, and hides slots nobody works", async () => {
    const off = await makePro("9000000001", "Off Duty");
    const late = await makePro("9000000002", "Late Shift");
    expect((await req("PUT", `${P}/pro/me/availability`, off, { acceptingJobs: false, workDays: ALL_DAYS, workStartHour: 8, workEndHour: 20 })).status).toBe(200);
    const r = await req("PUT", `${P}/pro/me/availability`, late, { acceptingJobs: true, workDays: ALL_DAYS, workStartHour: 16, workEndHour: 20 });
    expect(r.body.pro.availability).toMatchObject({ acceptingJobs: true, workStartHour: 16 });
    expect((await req("PUT", `${P}/pro/me/availability`, late, { acceptingJobs: true, workDays: ALL_DAYS, workStartHour: 18, workEndHour: 10 })).status).toBe(400);

    const c = await catalog();
    const days = (await req("GET", `${P}/slots?city=durgapur&categoryId=${c.cat("electrician").id}`)).body.days;
    const today = days[0].slots as { start: string; available: boolean }[];
    expect(today.find((x) => x.start === istInstant("2026-11-23", 15).toISOString())!.available).toBe(false);
    expect(today.find((x) => x.start === istInstant("2026-11-23", 17).toISOString())!.available).toBe(true);

    const s = await login();
    expect((await bookPaid(s, 17)).pro?.name).toBe("Late Shift");
  });

  it("when a pro drops the job, the next free pro gets it automatically, never the same pro", async () => {
    const a = await makePro("9000000001", "Amit Das");
    const bk = await makePro("9000000002", "Bikash Roy");
    const s = await login();
    const b = await bookPaid(s, 15);
    const first = b.pro!.name;
    const dropper = first === "Amit Das" ? a : bk;
    await t.messages();
    const r = await req("POST", `${P}/pro/jobs/${b.id}/cancel`, dropper, { reason: "Bike broke down" });
    expect(r.status).toBe(200);
    const after = (await req("GET", `${P}/bookings/${b.id}`, s)).body.booking;
    expect(after.status).toBe("assigned");
    expect(after.pro.name).not.toBe(first);
    const msgs = await t.messages();
    expect(msgs.some((m) => m.event === "pro_job_assigned")).toBe(true);
  });

  it("nobody free: alerts the team and opens the job to all partners; still nobody near the slot: full refund", async () => {
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 16);
    await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, { reason: "Family emergency" });
    expect(await proName(s, b.id)).toBeNull();

    const admin = await login("admin");
    const alerts = (await req("GET", `${P}/admin/bookings/alerts`, admin)).body.bookings as HomeBooking[];
    expect(alerts.map((x) => x.id)).toEqual([b.id]);
    expect(alerts[0]!.dispatch).toMatchObject({ alert: "No free professional for this slot", autoCancelAt: istInstant("2026-11-23", 14).toISOString() });

    // A new partner joins: the job is open to them in the meantime, and the loop places it.
    const other = await makePro("9000000002", "Bikash Roy");
    expect((await req("GET", `${P}/pro/jobs`, other)).body.available.map((j: HomeBooking) => j.id)).toEqual([b.id]);
    await req("PUT", `${P}/pro/me/availability`, other, { acceptingJobs: false, workDays: ALL_DAYS, workStartHour: 8, workEndHour: 20 });
    expect((await t.autoAssigner!.runOnce()).assigned).toBe(0);

    // 2 hours before the slot and still nobody: ZARVA cancels and refunds everything, fee included.
    advance(5 * 60 + 1);
    expect((await t.autoAssigner!.runOnce()).cancelled).toBe(1);
    const done = (await req("GET", `${P}/bookings/${b.id}`, s)).body.booking;
    expect(done).toMatchObject({ status: "cancelled", refundedPaise: done.totalPaise, cancellation: { by: "system" } });
    expect((await t.messages()).some((m) => m.event === "refund_started")).toBe(true);
    expect((await req("GET", `${P}/admin/bookings/alerts`, admin)).body.bookings).toEqual([]);
  });

  it("the loop places bookings that got no professional at payment time, and admin can retry by hand", async () => {
    const pro = await makePro();
    await req("PUT", `${P}/pro/me/availability`, pro, { acceptingJobs: true, workDays: ALL_DAYS, workStartHour: 8, workEndHour: 20 });
    const s = await login();
    const b = await bookPaid(s, 18);
    const other = await makePro("9000000002", "Bikash Roy");
    await req("POST", `${P}/pro/jobs/${b.id}/cancel`, pro, { reason: "Clash" });
    // Bikash was approved before the drop, so he gets it at once.
    expect(await proName(s, b.id)).toBe("Bikash Roy");
    await req("POST", `${P}/pro/jobs/${b.id}/cancel`, other, { reason: "Clash" });
    expect(await proName(s, b.id)).toBeNull();
    const admin = await login("admin");
    const retry = await req("POST", `${P}/admin/bookings/${b.id}/auto-assign`, admin);
    expect(retry.body.booking.dispatch.alert).toBe("No free professional for this slot");
    // Admin can always assign by hand, even someone who dropped it.
    expect((await req("POST", `${P}/admin/bookings/${b.id}/assign`, admin, { proId: (await req("GET", `${P}/pro/me`, pro)).body.pro.id })).status).toBe(200);
    expect(await proName(s, b.id)).toBe("Subrata Mondal");
  });

  it("a reschedule finds a pro for the new time straight away", async () => {
    await makePro();
    const s = await login();
    const b = await bookPaid(s, 15);
    const r = await req("POST", `${P}/bookings/${b.id}/reschedule`, s, { slotStart: istInstant("2026-11-24", 10).toISOString() });
    expect(r.body.booking).toMatchObject({ status: "assigned", pro: { name: "Subrata Mondal" } });
  });

  it("switched off in admin: nothing automatic, jobs wait in the open list", async () => {
    const admin = await login("admin");
    const p = (await req("GET", `${P}/admin/policy`, admin)).body.policy;
    expect(p).toMatchObject({ autoAssign: true, unfulfilledCancelMinutes: 120 });
    expect((await req("PUT", `${P}/admin/policy`, admin, { ...p, autoAssign: false })).status).toBe(200);
    const pro = await makePro();
    const s = await login();
    const b = await bookPaid(s, 15);
    expect(b.pro).toBeNull();
    expect((await req("GET", `${P}/pro/jobs`, pro)).body.available.map((j: HomeBooking) => j.id)).toEqual([b.id]);
  });
});
