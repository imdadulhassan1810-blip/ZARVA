import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { istInstant, type HomeService } from "@zarva/core";
import { PDFDocument } from "pdf-lib";
import { completeKyc, setupTestApp } from "./helpers";
import { renderInvoice, type InvoiceData } from "../src/modules/home/invoices";

// Monday 23 Nov 2026, 09:00 IST.
const START = new Date("2026-11-23T03:30:00.000Z");
const clock = { t: START.getTime() };
const ADMIN = "admin";
const P = "/v1/m/home";
const DAY = 24 * 60;
let t: Awaited<ReturnType<typeof setupTestApp>>;
type Session = Awaited<ReturnType<typeof t.login>>;
let sessions: Map<string, Promise<Session>>;
const login = (phone: string) => {
  if (!sessions.has(phone)) sessions.set(phone, (phone === ADMIN ? t.loginAdmin() : t.login(phone, phone.startsWith("90000") ? "partner" : "customer")) as Promise<Session>);
  return sessions.get(phone)!;
};
const advance = (min: number) => { clock.t += min * 60_000; };

async function start(env: Record<string, string> = {}) {
  sessions = new Map();
  clock.t = START.getTime();
  t = await setupTestApp({ ENABLED_MODULES: "home", ...env }, { now: () => new Date(clock.t) });
}
beforeEach(() => start());
afterEach(async () => { await t.close(); });

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
  await req("PATCH", `${P}/admin/pros/${a.body.pro.id}`, admin, { status: "active" });
  return { s, id: a.body.pro.id as string };
}
async function book(s: Session, hour = 11, services: [string, number][] = [["fan-repair", 1]]) {
  const c = await catalog();
  const addr = await req("POST", "/v1/me/addresses", s, {
    name: "Riya Sen", phone: "9876543210", line1: "12 Nehru Avenue", line2: "Benachity", city: "Durgapur", state: "West Bengal", pincode: "713216",
  });
  const r = await req("POST", `${P}/bookings`, s, {
    cityId: "durgapur", addressId: addr.body.address.id, slotStart: istInstant("2026-11-23", hour).toISOString(),
    items: services.map(([slug, qty]) => ({ serviceId: c.svc(slug).id, qty })), payMode: "online", idempotencyKey: `k-${Math.random()}`,
  });
  expect(r.status).toBe(201);
  // Prepaid only: pay with the mock checkout so the booking is confirmed.
  const m = await req("POST", `/v1/payments/mock/${r.body.payment.clientPayload.order_id}/succeed`);
  const paid = await req("POST", `${P}/bookings/${r.body.booking.id}/payment/confirm`, s, m.body.confirmation);
  expect(paid.body.booking.status).toBe("confirmed");
  return paid.body.booking as { id: string; code: string; startCode: string; totalPaise: number };
}
async function doJob(pro: Session, bookingId: string, startCode: string) {
  expect((await req("POST", `${P}/pro/jobs/${bookingId}/accept`, pro)).status).toBe(200);
  await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "on_the_way" });
  await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "in_progress", startCode });
  expect((await req("POST", `${P}/pro/jobs/${bookingId}/status`, pro, { status: "completed" })).status).toBe(200);
}
/** A customer named Riya Sen with one completed fan repair by Subrata. */
async function completedJob(phone = "9876500001", hour = 11) {
  const pro = await approvedPro();
  const cust = await login(phone);
  await req("PATCH", "/v1/me", cust, { name: "Riya Sen" });
  const b = await book(cust, hour);
  await doJob(pro.s, b.id, b.startCode);
  return { pro, cust, b };
}

describe("ratings and reviews", () => {
  it("lets only the customer rate a completed job, once, and shows it publicly with a short name", async () => {
    const pro = await approvedPro();
    const cust = await login("9876500001");
    await req("PATCH", "/v1/me", cust, { name: "Riya Sen" });
    const b = await book(cust);

    // Not completed yet: no rating.
    expect((await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 5 })).body.error.code).toBe("not_completed");
    await doJob(pro.s, b.id, b.startCode);

    const before = (await req("GET", `${P}/bookings/${b.id}`, cust)).body.booking;
    expect(before.review).toMatchObject({ review: null, canReview: true });

    // Someone else can't rate it (404, not 403: don't confirm the booking exists).
    const other = await login("9876500002");
    expect((await req("PUT", `${P}/bookings/${b.id}/review`, other, { rating: 1 })).status).toBe(404);
    // Partners can't use the customer route.
    expect((await req("PUT", `${P}/bookings/${b.id}/review`, pro.s, { rating: 5 })).status).toBe(403);

    // Tags that contradict the stars are dropped.
    const r = await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 5, comment: "  Fixed the fan in 20 minutes. ", tags: ["on_time", "rude", "skilled"] });
    expect(r.status).toBe(200);
    expect(r.body.review).toMatchObject({ rating: 5, comment: "Fixed the fan in 20 minutes.", tags: ["on_time", "skilled"], customerName: "Riya S." });
    expect(r.body).toMatchObject({ canReview: false, canEdit: true });

    const pub = await req("GET", `${P}/reviews?category=electrician`);
    expect(pub.body.reviews).toHaveLength(1);
    expect(pub.body.reviews[0]).toMatchObject({ rating: 5, customerName: "Riya S.", proName: "Subrata", serviceNames: "Fan repair", categorySlug: "electrician" });
    // Public data never carries booking codes or moderation fields.
    expect(pub.body.reviews[0]).not.toHaveProperty("bookingCode");
    expect(JSON.stringify(pub.body)).not.toContain("9876");

    const sum = await req("GET", `${P}/reviews/summary`);
    expect(sum.body.overall).toEqual({ average: 5, count: 1, stars: [0, 0, 0, 0, 1] });
    expect(sum.body.categories.electrician.count).toBe(1);

    // The customer sees the pro's rating on later bookings; the pro sees it in the partner app.
    const mine = await req("GET", `${P}/pro/reviews`, pro.s);
    expect(mine.body.summary).toMatchObject({ average: 5, count: 1 });
    expect(mine.body.reviews[0].comment).toBe("Fixed the fan in 20 minutes.");
  });

  it("allows changes for 7 days and new ratings for 30 days after completion", async () => {
    const { cust, b } = await completedJob();
    // A second job, done the same day, that is never rated in time.
    const b2 = await book(cust, 12);
    await doJob(await login("9000000001"), b2.id, b2.startCode);
    await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 2, tags: ["late"] });
    advance(3 * DAY);
    const edited = await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 4, tags: ["late", "polite"] });
    expect(edited.body.review).toMatchObject({ rating: 4, tags: ["polite"] });
    advance(5 * DAY);
    expect((await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 1 })).body.error.code).toBe("review_locked");

    advance(23 * DAY);
    expect((await req("PUT", `${P}/bookings/${b2.id}/review`, cust, { rating: 5 })).body.error.code).toBe("review_closed");
    expect((await req("GET", `${P}/bookings/${b2.id}/review`, cust)).body).toMatchObject({ canReview: false });
  });

  it("admin can hide an abusive review: it disappears from every public count", async () => {
    const { cust, b } = await completedJob();
    await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 1, comment: "call me on 98765 43210", tags: ["rude"] });
    const admin = await login(ADMIN);
    const list = await req("GET", `${P}/admin/reviews?maxRating=2`, admin);
    expect(list.body.reviews[0]).toMatchObject({ rating: 1, hidden: false, bookingCode: b.code, proName: "Subrata Mondal" });

    const hid = await req("POST", `${P}/admin/reviews/${list.body.reviews[0].id}/hide`, admin, { reason: "Phone number in text" });
    expect(hid.body.review).toMatchObject({ hidden: true, hiddenReason: "Phone number in text" });
    expect((await req("GET", `${P}/reviews`)).body.reviews).toEqual([]);
    expect((await req("GET", `${P}/reviews/summary`)).body.overall.count).toBe(0);
    // A hidden review can't be edited back into view by the customer.
    expect((await req("PUT", `${P}/bookings/${b.id}/review`, cust, { rating: 5 })).body.error.code).toBe("review_locked");
    // Customers can't reach moderation.
    expect((await req("GET", `${P}/admin/reviews`, cust)).status).toBe(403);
  });
});

describe("invoices", () => {
  it("issues a numbered bill when the job is completed and lets only the customer download it", async () => {
    const { cust, b } = await completedJob();
    const booking = (await req("GET", `${P}/bookings/${b.id}`, cust)).body.booking;
    expect(booking).toMatchObject({ hasInvoice: true, invoiceNumber: "ZH/26-27/000001" });

    const pdf = await req("GET", `${P}/bookings/${b.id}/invoice.pdf`, cust);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain('filename="ZARVA-ZH-26-27-000001.pdf"');
    expect(pdf.raw.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf.raw);
    expect(doc.getPageCount()).toBe(1);
    // Not GST-registered (no INVOICE_GSTIN): it must not call itself a tax invoice.
    expect(doc.getTitle()).toBe("ZARVA bill ZH/26-27/000001");

    expect((await req("GET", `${P}/bookings/${b.id}/invoice.pdf`, await login("9876500002"))).status).toBe(404);
    expect((await req("GET", `${P}/bookings/${b.id}/invoice.pdf`)).status).toBe(401);
  });

  it("has no invoice before completion, and numbers invoices in order without gaps", async () => {
    const pro = await approvedPro();
    const cust = await login("9876500001");
    const b1 = await book(cust, 11);
    const b2 = await book(cust, 12);
    expect((await req("GET", `${P}/bookings/${b1.id}/invoice.pdf`, cust)).body.error.code).toBe("no_invoice");
    expect((await req("GET", `${P}/bookings/${b1.id}`, cust)).body.booking.hasInvoice).toBe(false);
    await doJob(pro.s, b2.id, b2.startCode);
    await doJob(pro.s, b1.id, b1.startCode);
    expect((await req("GET", `${P}/bookings/${b2.id}`, cust)).body.booking.invoiceNumber).toBe("ZH/26-27/000001");
    expect((await req("GET", `${P}/bookings/${b1.id}`, cust)).body.booking.invoiceNumber).toBe("ZH/26-27/000002");
    // Downloading again never issues a new number.
    await req("GET", `${P}/bookings/${b1.id}/invoice.pdf`, cust);
    expect((await t.sql`select count(*)::int as n from home_invoices`)[0]!.n).toBe(2);
  });

  it("gives the phone app a 15-minute link that opens the PDF without a session", async () => {
    const { cust, b } = await completedJob();
    const link = await req("POST", `${P}/bookings/${b.id}/invoice-link`, cust);
    expect(link.body.path).toMatch(new RegExp(`^${P}/invoice-download/${b.id}\\?token=`));
    const open = await req("GET", link.body.path);
    expect(open.status).toBe(200);
    expect(open.headers["content-disposition"]).toContain("inline");
    // The token is for this booking only.
    const b2 = await book(cust, 12);
    await doJob(await login("9000000001"), b2.id, b2.startCode);
    expect((await req("GET", link.body.path.replace(b.id, b2.id))).status).toBe(401);
    advance(16);
    expect((await req("GET", link.body.path)).status).toBe(401);
  });

  it("prints a GST tax invoice with CGST + SGST once ZARVA has a GSTIN", async () => {
    await t.close();
    await start({ INVOICE_GSTIN: "19ABCDE1234F1Z5", INVOICE_LEGAL_NAME: "ZARVA Technologies Pvt Ltd" });
    const { b } = await completedJob();
    const [row] = await t.sql`select data from home_invoices where booking_id = ${b.id}`;
    const data = row!.data as InvoiceData;
    expect(data.kind).toBe("tax_invoice");
    expect(data.seller).toMatchObject({ gstin: "19ABCDE1234F1Z5", name: "ZARVA Technologies Pvt Ltd" });
    // Fan repair Rs 199 + Rs 29 fee = Rs 228 incl. 18% GST.
    expect(data.totalPaise).toBe(22800);
    expect(data.tax).toEqual({ rateBps: 1800, taxablePaise: 19322, cgstPaise: 1739, sgstPaise: 1739, igstPaise: 0 });
    expect(data.sac).toMatchObject({ code: "9987" });
    const doc = await PDFDocument.load(await renderInvoice(data));
    expect(doc.getTitle()).toBe("ZARVA tax invoice ZH/26-27/000001");
  });

  it("renders names the built-in PDF font can't draw without crashing", async () => {
    const { b } = await completedJob();
    const [row] = await t.sql`select data from home_invoices where booking_id = ${b.id}`;
    const data = { ...(row!.data as InvoiceData), buyer: { ...(row!.data as InvoiceData).buyer, name: "রিয়া সেন – ₹" } };
    const bytes = await renderInvoice(data);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("help and support", () => {
  it("a customer raises a ticket on their booking, ZARVA replies, the customer replies and it reopens", async () => {
    const { cust, b } = await completedJob();
    const create = await req("POST", "/v1/support/tickets", cust, {
      topic: "pro_behaviour", subject: "Asked for extra money", message: "The professional asked for Rs 100 more than the app price.", module: "home", referenceId: b.id,
    });
    expect(create.status).toBe(201);
    const ticket = create.body.ticket;
    expect(ticket).toMatchObject({ code: "ZT-1001", status: "open", topicLabel: "Professional's behaviour", referenceLabel: `Booking ${b.code} · Electrician` });
    expect(ticket.messages).toHaveLength(1);
    expect(ticket).not.toHaveProperty("customer");

    // One open ticket per booking.
    const dup = await req("POST", "/v1/support/tickets", cust, { topic: "other", subject: "Again", message: "Same booking, second ticket", module: "home", referenceId: b.id });
    expect(dup.body.error).toMatchObject({ code: "ticket_exists", details: { ticketId: ticket.id } });
    // Can't attach someone else's booking, or read someone else's ticket.
    const other = await login("9876500002");
    expect((await req("POST", "/v1/support/tickets", other, { topic: "other", subject: "Not mine", message: "Trying another booking id", module: "home", referenceId: b.id })).status).toBe(404);
    expect((await req("GET", `/v1/support/tickets/${ticket.id}`, other)).status).toBe(404);

    const admin = await login(ADMIN);
    const queue = await req("GET", "/v1/admin/support/tickets?status=open", admin);
    expect(queue.body.counts).toEqual({ open: 1, waiting_customer: 0, resolved: 0 });
    expect(queue.body.tickets[0].customer).toMatchObject({ name: "Riya Sen", phone: "+919876500001" });

    const replied = await req("POST", `/v1/admin/support/tickets/${ticket.id}/messages`, admin, { message: "Sorry about this. We've refunded Rs 100 and warned the professional." });
    expect(replied.body.ticket.status).toBe("waiting_customer");
    const seen = (await req("GET", `/v1/support/tickets/${ticket.id}`, cust)).body.ticket;
    expect(seen.statusLabel).toBe("ZARVA replied");
    expect(seen.messages[1]).toMatchObject({ from: "zarva", authorName: "Ops from ZARVA support" });

    await req("POST", `/v1/admin/support/tickets/${ticket.id}/messages`, admin, { message: "Closing this now.", resolve: true });
    expect((await req("GET", `/v1/support/tickets/${ticket.id}`, cust)).body.ticket.status).toBe("resolved");
    const reopened = await req("POST", `/v1/support/tickets/${ticket.id}/messages`, cust, { message: "The refund hasn't arrived." });
    expect(reopened.body.ticket).toMatchObject({ status: "open" });
    expect(reopened.body.ticket.messages).toHaveLength(4);

    const forBooking = await req("GET", `/v1/support/tickets?module=home&referenceId=${b.id}`, cust);
    expect(forBooking.body.tickets.map((x: { id: string }) => x.id)).toEqual([ticket.id]);
  });

  it("limits open tickets and validates input", async () => {
    const cust = await login("9876500001");
    expect((await req("POST", "/v1/support/tickets", cust, { topic: "other", subject: "Hi", message: "short" })).status).toBe(400);
    for (let i = 0; i < 5; i++) {
      expect((await req("POST", "/v1/support/tickets", cust, { topic: "app_problem", subject: `Problem ${i}`, message: "The app shows a blank page." })).status).toBe(201);
    }
    expect((await req("POST", "/v1/support/tickets", cust, { topic: "app_problem", subject: "One more", message: "The app shows a blank page." })).body.error.code).toBe("too_many_open");
  });

  it("collects feedback for the team", async () => {
    const cust = await login("9876500001");
    expect((await req("POST", "/v1/support/feedback", cust, { kind: "suggestion", rating: 4, message: "Please add AC gas refill.", platform: "android" })).status).toBe(201);
    expect((await req("POST", "/v1/support/feedback", undefined, { kind: "bug", message: "Anonymous" })).status).toBe(401);
    const admin = await login(ADMIN);
    const fb = await req("GET", "/v1/admin/feedback", admin);
    expect(fb.body.feedback[0]).toMatchObject({ kind: "suggestion", rating: 4, platform: "android", message: "Please add AC gas refill." });
  });
});
