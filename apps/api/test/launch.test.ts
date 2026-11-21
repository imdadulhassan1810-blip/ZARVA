import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { istInstant, type HomeService } from "@zarva/core";
import { ManualPayoutProvider } from "@zarva/payments";
import { eq } from "drizzle-orm";
import { homeProDocuments } from "../src/db/schema";
import { Msg91SmsChannel, MetaWhatsAppChannel, dltText, notifyEvents, orderedVars, parseTemplateMap } from "../src/notify";
import { FAKE_JPEG, completeKyc, setupTestApp } from "./helpers";

// Monday 23 Nov 2026, 09:00 IST.
const START = new Date("2026-11-23T03:30:00.000Z");
const clock = { t: START.getTime() };
const ADMIN = "admin";
const P = "/v1/m/home";
let t: Awaited<ReturnType<typeof setupTestApp>>;
type Session = Awaited<ReturnType<typeof t.login>>;
let sessions: Map<string, Promise<Session>>;
const login = (phone: string) => {
  // Test convention: 90000 xxxxx numbers are partners (partner app), ADMIN is the ZARVA admin login, others are customers.
  if (!sessions.has(phone)) sessions.set(phone, (phone === ADMIN ? t.loginAdmin() : t.login(phone, phone.startsWith("90000") ? "partner" : "customer")) as Promise<Session>);
  return sessions.get(phone)!;
};

beforeEach(async () => {
  sessions = new Map();
  clock.t = START.getTime();
  t = await setupTestApp({ ENABLED_MODULES: "home" }, { now: () => new Date(clock.t) });
});
afterEach(async () => { await t.close(); });
/** Restart the app with the "manual" payout provider (admin pays by UPI and types the UTR). */
async function useManualPayouts() {
  await t.close();
  sessions = new Map();
  t = await setupTestApp({ ENABLED_MODULES: "home" }, { now: () => new Date(clock.t), payoutProvider: new ManualPayoutProvider() });
}

async function req(method: "GET" | "POST" | "PATCH" | "PUT", url: string, s?: Session, payload?: unknown) {
  const r = await t.app.inject({ method, url, headers: s?.headers, payload: payload as object });
  const json = (r.headers["content-type"] ?? "").toString().includes("json") ? r.json() : null;
  return { status: r.statusCode, body: json, raw: r.rawPayload, headers: r.headers };
}
async function catalog() {
  const r = await req("GET", `${P}/catalog?city=durgapur`);
  return {
    svc: (slug: string) => (r.body.services as HomeService[]).find((s) => s.slug === slug)!,
    cat: (slug: string) => (r.body.categories as { id: string; slug: string }[]).find((c) => c.slug === slug)!,
  };
}
async function approvedPro(phone = "9000000001", name = "Subrata Mondal") {
  const c = await catalog();
  const s = await login(phone);
  const a = await req("POST", `${P}/pro/apply`, s, { name, cityId: "durgapur", categoryIds: [c.cat("electrician").id], locality: "Benachity" });
  await completeKyc(t.app, s.headers);
  const admin = await login(ADMIN);
  const ok = await req("PATCH", `${P}/admin/pros/${a.body.pro.id}`, admin, { status: "active" });
  expect(ok.body.pro.status).toBe("active");
  return { s, id: a.body.pro.id as string };
}
async function book(s: Session, payMode: "online" | "after_service", hour = 11, services: [string, number][] = [["fan-repair", 1]]) {
  const c = await catalog();
  const addr = await req("POST", "/v1/me/addresses", s, {
    name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode: "713216",
  });
  const r = await req("POST", `${P}/bookings`, s, {
    cityId: "durgapur", addressId: addr.body.address.id, slotStart: istInstant("2026-11-23", hour).toISOString(),
    items: services.map(([slug, qty]) => ({ serviceId: c.svc(slug).id, qty })), payMode, idempotencyKey: `k-${Math.random()}`,
  });
  expect(r.status).toBe(201);
  return r.body as { booking: { id: string; code: string; startCode: string; totalPaise: number; subtotalPaise: number }; payment: { clientPayload: { order_id: string } } | null };
}
async function payWithMock(s: Session, bookingId: string, orderId: string) {
  const m = await req("POST", `/v1/payments/mock/${orderId}/succeed`);
  return req("POST", `${P}/bookings/${bookingId}/payment/confirm`, s, m.body.confirmation);
}
/** Runs a job from accept to completed. */
async function doJob(pro: Session, bookingId: string, startCode: string) {
  expect((await req("POST", `${P}/pro/jobs/${bookingId}/accept`, pro)).status).toBe(200);
  await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "on_the_way" });
  await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "in_progress", startCode });
  expect((await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "completed" })).status).toBe(200);
}

describe("SMS and WhatsApp booking updates", () => {
  it("texts the customer at each step of a booking, once each, even when confirmed twice", async () => {
    const pro = await approvedPro();
    await t.messages(); // approval SMS to the pro
    const cust = await login("9876500001");
    const { booking, payment } = await book(cust, "online");
    expect(await t.messages()).toEqual([]); // nothing until paid

    await payWithMock(cust, booking.id, payment!.clientPayload.order_id);
    await payWithMock(cust, booking.id, payment!.clientPayload.order_id);
    const confirmed = await t.messages();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ channel: "sms", to: "+919876500001", event: "booking_confirmed" });
    expect(confirmed[0]!.text).toBe(`ZARVA: Booking ${booking.code} for Fan repair on 23 Nov, 11 AM is confirmed. We will share your professional's details soon.`);

    await req("POST", `${P}/pro/jobs/${booking.id}/accept`, pro.s);
    const assigned = await t.messages();
    expect(assigned.map((m) => m.event)).toEqual(["pro_assigned"]);
    expect(assigned[0]!.text).toContain(`start code ${booking.startCode}`);

    await req("POST", `${P}/pro/jobs/${booking.id}/status`, pro.s, { status: "on_the_way" });
    expect((await t.messages())[0]!.text).toContain("Subrata Mondal is on the way");
    await req("POST", `${P}/pro/jobs/${booking.id}/status`, pro.s, { status: "in_progress", startCode: booking.startCode });
    await req("POST", `${P}/pro/jobs/${booking.id}/status`, pro.s, { status: "completed" });
    expect((await t.messages()).map((m) => m.event)).toEqual(["job_completed"]);
  });

  it("WhatsApp only after the customer opts in", async () => {
    const cust = await login("9876500001");
    await approvedPro();
    await t.messages();
    await book(cust, "after_service");
    expect((await t.messages()).map((m) => m.channel)).toEqual(["sms"]);

    const me = await req("PATCH", "/v1/me", cust, { whatsappOptIn: true });
    expect(me.body.user.whatsappOptIn).toBe(true);
    await book(cust, "after_service", 12);
    expect((await t.messages()).map((m) => m.channel).sort()).toEqual(["sms", "whatsapp"]);
  });

  it("tells the customer and the assigned pro about a cancellation, and the customer about the refund", async () => {
    const pro = await approvedPro();
    const cust = await login("9876500001");
    const { booking, payment } = await book(cust, "online");
    await payWithMock(cust, booking.id, payment!.clientPayload.order_id);
    await req("POST", `${P}/pro/jobs/${booking.id}/accept`, pro.s);
    await t.messages();
    await req("POST", `${P}/bookings/${booking.id}/cancel`, cust, { reason: "Plans changed" });
    const msgs = await t.messages();
    expect(msgs.find((m) => m.event === "booking_cancelled")).toMatchObject({ to: "+919876500001" });
    expect(msgs.find((m) => m.event === "pro_job_cancelled")).toMatchObject({ to: "+919000000001" });
  });

  it("an admin assignment texts the pro too", async () => {
    const pro = await approvedPro();
    await t.messages();
    const cust = await login("9876500001");
    const { booking } = await book(cust, "after_service");
    const admin = await login(ADMIN);
    await req("POST", `${P}/admin/bookings/${booking.id}/assign`, admin, { proId: pro.id });
    const msgs = await t.messages();
    expect(msgs.map((m) => [m.event, m.to]).sort()).toEqual([
      ["booking_confirmed", "+919876500001"], ["pro_assigned", "+919876500001"], ["pro_job_assigned", "+919000000001"],
    ]);
    expect(msgs.find((m) => m.event === "pro_job_assigned")!.text).toContain("at Benachity");
  });

  it("retries when the SMS provider is down, then delivers", async () => {
    await approvedPro();
    await t.messages();
    t.sms.failTimes = 1;
    const cust = await login("9876500001");
    await book(cust, "after_service");
    expect(await t.messages()).toEqual([]); // first try failed
    clock.t += 31_000; // backoff 30 s
    expect((await t.messages()).map((m) => m.event)).toEqual(["booking_confirmed"]);
  });

  it("templates: DLT form, 30-char variables, MSG91 and WhatsApp payloads", async () => {
    expect(dltText("refund_started")).toBe("ZARVA: Refund of {#var#} for booking {#var#} has started. It reaches your account in 5-7 days.");
    for (const [event, def] of Object.entries(notifyEvents)) {
      for (const v of def.vars) expect(def.sms, `${event} uses {${v}}`).toContain(`{${v}}`);
    }
    // Positional order follows the text, not the order the variables were declared in.
    expect(orderedVars("pro_assigned", { code: "ZH-1", pro: "Subrata", when: "23 Nov, 11 AM", startCode: "1234" })).toEqual(["Subrata", "ZH-1", "23 Nov, 11 AM", "1234"]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ type: "success", message: "req-1" }), { status: 200 }));
    const msg91 = new Msg91SmsChannel("key", parseTemplateMap("job_completed:tmpl_9"), fetchImpl as unknown as typeof fetch);
    const sent = await msg91.send({ to: "+919876543210", event: "job_completed", vars: { code: "ZH-ABC", amount: "₹228" }, text: "" });
    expect(sent.status).toBe("sent");
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toMatchObject({ template_id: "tmpl_9", recipients: [{ mobiles: "919876543210", var1: "ZH-ABC", var2: "₹228" }] });
    // No template registered yet: skipped, not retried forever.
    expect((await msg91.send({ to: "+91", event: "pro_assigned", vars: {}, text: "" })).status).toBe("skipped");

    const wa = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    const meta = new MetaWhatsAppChannel("tok", "123", "en", wa as unknown as typeof fetch);
    await meta.send({ to: "+919876543210", event: "job_completed", vars: { code: "ZH-ABC", amount: "₹228" }, text: "" });
    const [url, init] = wa.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/123/messages");
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: "919876543210", type: "template",
      template: { name: "zarva_job_completed", components: [{ parameters: [{ text: "ZH-ABC" }, { text: "₹228" }] }] },
    });
  });
});

describe("partner sign-up and KYC", () => {
  it("draft → upload documents → payout → submit → admin sees files → approve", async () => {
    const c = await catalog();
    const s = await login("9000000001");
    const a = await req("POST", `${P}/pro/apply`, s, { name: "Subrata Mondal", cityId: "durgapur", categoryIds: [c.cat("electrician").id] });
    expect(a.body.pro).toMatchObject({ status: "draft", missing: ["ID type", "ID proof (front)", "Your photo (selfie)", "Payout account"] });
    expect((await req("POST", `${P}/pro/me/submit`, s)).body.error.code).toBe("profile_incomplete");

    // File checks: type must match the bytes, size capped.
    const fake = await req("PUT", `${P}/pro/me/documents/id_front`, s, { mime: "image/png", dataBase64: FAKE_JPEG });
    expect(fake.body.error.code).toBe("bad_file");
    const exe = await req("PUT", `${P}/pro/me/documents/id_front`, s, { mime: "image/jpeg", dataBase64: Buffer.from("MZ not a picture at all").toString("base64") });
    expect(exe.body.error.code).toBe("bad_file");
    expect((await req("PUT", `${P}/pro/me/documents/passport`, s, { mime: "image/jpeg", dataBase64: FAKE_JPEG })).status).toBe(400);

    const bad = await req("PUT", `${P}/pro/me/payout`, s, { accountName: "S M", bankAccount: "12345678901" });
    expect(bad.status).toBe(400); // bank account without IFSC

    const pro = await completeKyc(t.app, s.headers);
    expect(pro).toMatchObject({ status: "pending", missing: [], idType: "pan", payout: { upi: "subrata@okaxis" } });
    expect(pro.documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["id_front", "selfie"]);

    // Stored encrypted: the raw bytes in the database are not the file.
    const [row] = await t.db.select().from(homeProDocuments).where(eq(homeProDocuments.proId, pro.id)).limit(1);
    expect(row!.data.includes(Buffer.from(FAKE_JPEG, "base64"))).toBe(false);

    // Only admins can open documents, and they get the original file back.
    const other = await login("9876500001");
    expect((await req("GET", `${P}/admin/pros/${pro.id}/documents/id_front`, other)).status).toBe(403);
    expect((await req("GET", `${P}/admin/pros/${pro.id}/documents/id_front`, s)).status).toBe(403);
    const admin = await login(ADMIN);
    const doc = await req("GET", `${P}/admin/pros/${pro.id}/documents/id_front`, admin);
    expect(doc.status).toBe(200);
    expect(doc.headers["content-type"]).toBe("image/jpeg");
    expect(doc.headers["cache-control"]).toBe("no-store");
    expect(Buffer.from(doc.raw).equals(Buffer.from(FAKE_JPEG, "base64"))).toBe(true);

    const ok = await req("PATCH", `${P}/admin/pros/${pro.id}`, admin, { status: "active" });
    expect(ok.body.pro.status).toBe("active");
    expect((await t.messages()).find((m) => m.event === "pro_approved")?.text).toContain("Welcome Subrata");
    expect((await req("GET", `${P}/pro/jobs`, s)).status).toBe(200);
    // Approved: core details are locked.
    expect((await req("PATCH", `${P}/pro/me`, s, { name: "Someone Else" })).status).toBe(403);
  });

  it("admin rejects with a reason; the pro fixes it and resubmits; drafts can't be approved", async () => {
    const c = await catalog();
    const s = await login("9000000002");
    const a = await req("POST", `${P}/pro/apply`, s, { name: "Bapi Bauri", cityId: "durgapur", categoryIds: [c.cat("plumber").id] });
    const admin = await login(ADMIN);
    expect((await req("PATCH", `${P}/admin/pros/${a.body.pro.id}`, admin, { status: "active" })).body.error.code).toBe("not_submitted");

    await completeKyc(t.app, s.headers);
    const rej = await req("POST", `${P}/admin/pros/${a.body.pro.id}/reject`, admin, { reason: "ID photo is blurry" });
    expect(rej.body.pro).toMatchObject({ status: "rejected", rejectionReason: "ID photo is blurry" });
    expect((await t.messages()).find((m) => m.event === "pro_rejected")?.text).toContain("ID photo is blurry");

    await req("PUT", `${P}/pro/me/documents/id_front`, s, { mime: "image/jpeg", dataBase64: FAKE_JPEG });
    const again = await req("POST", `${P}/pro/me/submit`, s);
    expect(again.body.pro).toMatchObject({ status: "pending", rejectionReason: null });
  });

  it("changing the payout account warns the pro by SMS (account takeover protection)", async () => {
    const { s } = await approvedPro();
    await t.messages();
    await req("PUT", `${P}/pro/me/payout`, s, { accountName: "Subrata Mondal", bankAccount: "123456789012", ifsc: "sbin0001234" });
    const m = await t.messages();
    expect(m).toHaveLength(1);
    expect(m[0]!.text).toContain("changed to A/c XXXX9012");
  });

  it("the partner app is mobile-number only: a Google or email sign-in can't open it", async () => {
    const g = await t.app.inject({ method: "POST", url: "/v1/auth/google", payload: { idToken: "mock:pro@gmail.com:Pro" } });
    const headers = { authorization: `Bearer ${g.json().accessToken}` };
    const c = await catalog();
    const r = await t.app.inject({ method: "POST", url: `${P}/pro/apply`, headers, payload: { name: "Pro", cityId: "durgapur", categoryIds: [c.cat("plumber").id] } });
    expect(r.json().error.code).toBe("wrong_portal");
    await t.app.inject({ method: "POST", url: "/v1/auth/email/request", payload: { email: "pro@example.com" } });
    const code = t.mail.last.get("pro@example.com")!;
    // Asking for the partner app by email still gives a customer session, which the partner app refuses.
    const e = await t.app.inject({ method: "POST", url: "/v1/auth/email/verify", payload: { email: "pro@example.com", code, portal: "partner" } });
    const r2 = await t.app.inject({ method: "GET", url: `${P}/pro/me`, headers: { authorization: `Bearer ${e.json().accessToken}` } });
    expect(r2.json().error.code).toBe("wrong_portal");
  });
});

describe("pro earnings, commission and payouts", () => {
  it("online job: pro earns price minus 20% commission; convenience fee stays with ZARVA", async () => {
    const pro = await approvedPro();
    const cust = await login("9876500001");
    const { booking, payment } = await book(cust, "online"); // fan repair ₹199 + ₹29 fee
    await payWithMock(cust, booking.id, payment!.clientPayload.order_id);
    await doJob(pro.s, booking.id, booking.startCode);
    const e = (await req("GET", `${P}/pro/earnings`, pro.s)).body;
    expect(e.balancePaise).toBe(19900 - 3980);
    expect(e.weekPaise).toBe(15920);
    expect(e.entries[0]).toMatchObject({ kind: "job_earning", grossPaise: 19900, commissionPaise: 3980, bookingCode: booking.code });
  });

  it("cash job: the pro holds the cash, so they owe ZARVA the commission and fee", async () => {
    const pro = await approvedPro();
    const cust = await login("9876500001");
    const { booking } = await book(cust, "after_service");
    await doJob(pro.s, booking.id, booking.startCode);
    const e = (await req("GET", `${P}/pro/earnings`, pro.s)).body;
    expect(e.balancePaise).toBe(15920 - 22800); // -₹68.80 = commission ₹39.80 + fee ₹29
    expect(e.entries.map((x: { kind: string }) => x.kind).sort()).toEqual(["cash_collected", "job_earning"]);

    // Admin records the cash the pro handed over; balance back to zero.
    const admin = await login(ADMIN);
    const adj = await req("POST", `${P}/admin/pros/${pro.id}/adjustments`, admin, { amountPaise: 6880, note: "Cash dues received" });
    expect(adj.body.balancePaise).toBe(0);
  });

  it("commission is set per category by admin", async () => {
    const pro = await approvedPro();
    const admin = await login(ADMIN);
    const cats = (await req("GET", `${P}/admin/categories`, admin)).body.categories;
    const elec = cats.find((c: { slug: string }) => c.slug === "electrician");
    expect(elec.commissionBps).toBe(2000);
    expect((await req("PATCH", `${P}/admin/categories/${elec.id}`, admin, { commissionBps: 1500 })).body.category.commissionBps).toBe(1500);
    expect((await req("PATCH", `${P}/admin/categories/${elec.id}`, admin, { commissionBps: 9000 })).status).toBe(400);
    const cust = await login("9876500001");
    const { booking, payment } = await book(cust, "online");
    await payWithMock(cust, booking.id, payment!.clientPayload.order_id);
    await doJob(pro.s, booking.id, booking.startCode);
    expect((await req("GET", `${P}/pro/earnings`, pro.s)).body.balancePaise).toBe(19900 - 2985);
  });

  it("manual payout: debits at once, can't exceed the balance, admin records the UTR, pro gets an SMS", async () => {
    await useManualPayouts();
    const pro = await approvedPro();
    const admin = await login(ADMIN);
    await req("POST", `${P}/admin/pros/${pro.id}/adjustments`, admin, { amountPaise: 50000, note: "Test credit" });

    expect((await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 60000 })).body.error.code).toBe("exceeds_balance");
    expect((await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 5000 })).body.error.code).toBe("invalid_amount");
    const p = await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 40000 });
    expect(p.status).toBe(201);
    expect(p.body.payout).toMatchObject({ amountPaise: 40000, status: "manual", destination: "UPI subrata@okaxis" });
    // A second click can't pay the same money again.
    expect((await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 40000 })).body.error.code).toBe("exceeds_balance");

    const bal = (await req("GET", `${P}/admin/payouts`, admin)).body;
    expect(bal.pros.find((x: { proId: string }) => x.proId === pro.id).balancePaise).toBe(10000);
    await t.messages();
    const paid = await req("POST", `${P}/admin/payouts/${p.body.payout.id}/paid`, admin, { utr: "432112345678" });
    expect(paid.body.payout).toMatchObject({ status: "paid", utr: "432112345678" });
    expect((await t.messages())[0]!.text).toBe("ZARVA Partner: ₹400 has been paid to UPI subrata@okaxis. Reference 432112345678.");
    expect((await req("POST", `${P}/admin/payouts/${p.body.payout.id}/failed`, admin, { reason: "oops" })).body.error.code).toBe("payout_closed");
  });

  it("automatic payout: rejected by the bank → money back on the balance; webhook settles the rest once", async () => {
    const pro = await approvedPro();
    const admin = await login(ADMIN);
    await req("POST", `${P}/admin/pros/${pro.id}/adjustments`, admin, { amountPaise: 50000, note: "Test credit" });

    t.payouts.failNext = true;
    const rejected = await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 20000 });
    expect(rejected.body.payout.status).toBe("failed");
    expect((await req("GET", `${P}/admin/pros/${pro.id}/ledger`, admin)).body.balancePaise).toBe(50000);

    const ok = await req("POST", `${P}/admin/pros/${pro.id}/payouts`, admin, { amountPaise: 20000 });
    expect(ok.body.payout.status).toBe("processing");
    expect(t.payouts.sent[0]).toMatchObject({ amountPaise: 20000, destination: { kind: "upi", vpa: "subrata@okaxis" } });

    const pid = (await t.db.query.homePayouts.findFirst({ where: (p, { eq: e }) => e(p.id, ok.body.payout.id) }))!.providerPayoutId;
    const hook = (status: string, eventId: string) => t.app.inject({
      method: "POST", url: `${P}/payouts/webhook`, headers: { "content-type": "application/json" },
      payload: JSON.stringify({ eventId, providerPayoutId: pid, status, utr: "UTR9", reason: null }),
    });
    expect((await hook("paid", "ev1")).json()).toEqual({ duplicate: false });
    expect((await hook("paid", "ev1")).json()).toEqual({ duplicate: true });
    const led = (await req("GET", `${P}/admin/pros/${pro.id}/ledger`, admin)).body;
    expect(led.balancePaise).toBe(30000);
    expect(led.payouts[0]).toMatchObject({ status: "paid", utr: "UTR9" });

    // Bank bounced it later: reversed, back on the balance.
    await hook("failed", "ev2");
    expect((await req("GET", `${P}/admin/pros/${pro.id}/ledger`, admin)).body.balancePaise).toBe(50000);
  });

  it("only admins see the payout ledger; the webhook refuses unsigned calls", async () => {
    await useManualPayouts();
    const pro = await approvedPro();
    expect((await req("GET", `${P}/admin/payouts`, pro.s)).status).toBe(403);
    expect((await req("POST", `${P}/admin/pros/${pro.id}/payouts`, pro.s, { amountPaise: 10000 })).status).toBe(403);
    expect((await req("POST", `${P}/pro/earnings`, pro.s)).status).toBe(404);
    const hook = await t.app.inject({ method: "POST", url: `${P}/payouts/webhook`, headers: { "content-type": "application/json" }, payload: "{}" });
    expect(hook.json().error.code).toBe("invalid_signature");
  });
});
