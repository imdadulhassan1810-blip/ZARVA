import type { FastifyInstance, FastifyReply } from "fastify";
import {
  homeBookingStatuses, homeCancelSchema, homeCreateBookingSchema, homeProCancelSchema, homeRescheduleSchema, homeReviewSchema, homeDocUploadSchema, homeProApplySchema, homeProDocKinds, homeProPayoutSchema, homeProUpdateSchema, homeProAvailabilitySchema,
  type HomePolicyInput,
} from "@zarva/core";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { parse } from "../../lib/validate";
import type { HomeServicesService } from "./service";
import type { PartnerService } from "./partners";
import type { EarningsService } from "./earnings";
import type { InvoiceService } from "./invoices";
import type { ReviewService } from "./reviews";
import type { PolicyService } from "./policy";

const idParam = z.object({ id: z.string().uuid() });
const confirmSchema = z.object({
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

const docParam = z.object({ id: z.string().uuid().optional(), kind: z.enum(homeProDocKinds) });
/** Base64 of a 5 MB file plus JSON wrapping. Only the upload route accepts bodies this big. */
const UPLOAD_LIMIT = 7.5 * 1024 * 1024;

export function homeRoutes(
  app: FastifyInstance,
  prefix: string,
  { svc, partners, earnings, invoices, reviews, policy }: {
    svc: HomeServicesService; partners: PartnerService; earnings: EarningsService; invoices: InvoiceService; reviews: ReviewService; policy: PolicyService;
  },
) {
  const sendPdf = (reply: FastifyReply, pdf: { bytes: Uint8Array; filename: string }, download: boolean) =>
    reply
      .header("content-type", "application/pdf")
      .header("cache-control", "private, no-store")
      .header("content-disposition", `${download ? "attachment" : "inline"}; filename="${pdf.filename}"`)
      .send(Buffer.from(pdf.bytes));

  // ----- Public catalogue -----
  app.get(`${prefix}/cities`, async () => ({ cities: await svc.cities() }));

  app.get(`${prefix}/catalog`, async (req) => {
    const { city } = parse(z.object({ city: z.string().min(2).max(40).default("durgapur") }), req.query);
    return svc.catalog(city);
  });

  app.get(`${prefix}/slots`, async (req) => {
    const q = parse(z.object({ city: z.string().min(2).max(40), categoryId: z.string().uuid() }), req.query);
    return { days: await svc.slots(q.city, q.categoryId) };
  });

  // ----- Ratings (public: published reviews only, customer names shortened) -----
  app.get(`${prefix}/reviews`, async (req) => {
    const q = parse(z.object({
      category: z.string().min(2).max(40).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(12),
      minRating: z.coerce.number().int().min(1).max(5).optional(),
      withComment: z.enum(["true", "false"]).optional(),
    }), req.query);
    return { reviews: await reviews.list({ categorySlug: q.category, limit: q.limit, minRating: q.minRating, withComment: q.withComment === "true" }) };
  });
  app.get(`${prefix}/reviews/summary`, async () => reviews.summaries());

  // A short-lived link from POST .../invoice-link, so the phone app can open the PDF in the browser.
  app.get(`${prefix}/invoice-download/:id`, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const { token } = parse(z.object({ token: z.string().min(20).max(1000) }), req.query);
    await invoices.checkLinkToken(id, token);
    return sendPdf(reply, await invoices.pdf(id), false);
  });

  // ----- Customer app -----
  app.register(async (r) => {
    r.addHook("preHandler", app.requireCustomer);

    r.post(`${prefix}/bookings`, async (req, reply) => {
      const input = parse(homeCreateBookingSchema, req.body);
      return reply.code(201).send(await svc.createBooking(req.userId!, input));
    });
    r.get(`${prefix}/bookings`, async (req) => ({ bookings: await svc.list(req.userId!) }));
    r.get(`${prefix}/bookings/:id`, async (req) => ({ booking: await svc.get(req.userId!, parse(idParam, req.params).id) }));
    r.post(`${prefix}/bookings/:id/pay`, async (req) => svc.pay(req.userId!, parse(idParam, req.params).id));
    r.post(`${prefix}/bookings/:id/payment/confirm`, async (req) => {
      const { id } = parse(idParam, req.params);
      await svc.get(req.userId!, id);
      await app.services.payments.confirmFromClient(req.userId!, parse(confirmSchema, req.body));
      // Paid: give it to a free professional straight away (the background loop also catches webhook-only payments).
      // A problem here must not fail the payment: the loop retries within seconds.
      await svc.autoAssignNow(id).catch((e: Error) => req.log.error(e, "auto-assign after payment"));
      return { booking: await svc.get(req.userId!, id) };
    });
    r.get(`${prefix}/bookings/:id/review`, async (req) => reviews.forBooking(req.userId!, parse(idParam, req.params).id));
    r.put(`${prefix}/bookings/:id/review`, async (req) => reviews.submit(req.userId!, parse(idParam, req.params).id, parse(homeReviewSchema, req.body)));
    r.get(`${prefix}/bookings/:id/invoice.pdf`, async (req, reply) => {
      const { id } = parse(idParam, req.params);
      await svc.assertOwner(req.userId!, id);
      return sendPdf(reply, await invoices.pdf(id), true);
    });
    r.post(`${prefix}/bookings/:id/invoice-link`, async (req) => {
      const { id } = parse(idParam, req.params);
      await svc.assertOwner(req.userId!, id);
      await invoices.get(id); // fails early if the job isn't completed
      return { path: `${prefix}/invoice-download/${id}?token=${await invoices.linkToken(id)}`, expiresInSeconds: 900 };
    });
    r.get(`${prefix}/bookings/:id/cancel-quote`, async (req) => ({ cancelInfo: await svc.cancelQuote(req.userId!, parse(idParam, req.params).id) }));
    r.post(`${prefix}/bookings/:id/cancel`, async (req) => {
      const { reason, expectedRefundPaise } = parse(homeCancelSchema, req.body ?? {});
      return { booking: await svc.cancel(req.userId!, parse(idParam, req.params).id, reason, expectedRefundPaise) };
    });
    r.post(`${prefix}/bookings/:id/reschedule`, async (req) => {
      const { slotStart } = parse(homeRescheduleSchema, req.body);
      return { booking: await svc.reschedule(req.userId!, parse(idParam, req.params).id, slotStart) };
    });

  });

  // ----- Partner app (sessions opened on the partner sign-in page only) -----
  app.register(async (r) => {
    r.addHook("preHandler", app.requirePartner);
    // Sign-up and KYC (anyone signed in to the partner app can start one).
    r.get(`${prefix}/pro/me`, async (req) => ({ pro: await partners.me(req.userId!) }));
    r.post(`${prefix}/pro/apply`, async (req, reply) => reply.code(201).send({ pro: await partners.apply(req.userId!, parse(homeProApplySchema, req.body)) }));
    r.patch(`${prefix}/pro/me`, async (req) => ({ pro: await partners.update(req.userId!, parse(homeProUpdateSchema, req.body)) }));
    r.put(`${prefix}/pro/me/documents/:kind`, { bodyLimit: UPLOAD_LIMIT }, async (req) => {
      const { kind } = parse(docParam, req.params);
      const { mime, dataBase64 } = parse(homeDocUploadSchema, req.body);
      return { pro: await partners.uploadDocument(req.userId!, kind, mime, dataBase64) };
    });
    r.put(`${prefix}/pro/me/payout`, async (req) => ({ pro: await partners.setPayout(req.userId!, parse(homeProPayoutSchema, req.body)) }));
    r.put(`${prefix}/pro/me/availability`, async (req) => ({ pro: await partners.setAvailability(req.userId!, parse(homeProAvailabilitySchema, req.body)) }));
    r.post(`${prefix}/pro/me/submit`, async (req) => ({ pro: await partners.submit(req.userId!) }));
    r.get(`${prefix}/pro/earnings`, async (req) => {
      const pro = await partners.proFor(req.userId!);
      if (!pro || (pro.status !== "active" && pro.status !== "suspended")) return {
        balancePaise: 0, weekPaise: 0, jobsThisWeek: 0, penaltiesWeekPaise: 0, entries: [], payouts: [],
        cancelStats: { today: 0, week: 0, freePerDay: 0, maxPerWeek: 0, todayPenaltyBps: 0, nextPenaltyBps: 0, canCancel: false },
      };
      return earnings.earnings(pro.id);
    });

    r.get(`${prefix}/pro/jobs`, async (req) => svc.proJobs(req.userId!));
    r.get(`${prefix}/pro/reviews`, async (req) => {
      const pro = await partners.proFor(req.userId!);
      if (!pro) return { summary: { average: null, count: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] };
      return reviews.forPro(pro.id);
    });
    r.post(`${prefix}/pro/jobs/:id/accept`, async (req) => ({ booking: await svc.accept(req.userId!, parse(idParam, req.params).id) }));
    r.get(`${prefix}/pro/cancel-stats`, async (req) => ({ cancelStats: await svc.proCancelStats(req.userId!) }));
    r.post(`${prefix}/pro/jobs/:id/cancel`, async (req) => {
      const { reason } = parse(homeProCancelSchema, req.body);
      return { cancelStats: await svc.proCancel(req.userId!, parse(idParam, req.params).id, reason) };
    });
    r.post(`${prefix}/pro/jobs/:id/status`, async (req) => {
      const body = parse(z.object({ status: z.enum(["on_the_way", "in_progress", "completed"]), startCode: z.string().regex(/^\d{4}$/).optional() }), req.body);
      return { booking: await svc.proUpdate(req.userId!, parse(idParam, req.params).id, body.status, body.startCode) };
    });
  });

  // ----- Admin app -----
  app.register(async (r) => {
    // Every admin route: a ZARVA team session (username + password + authenticator code). See admin/guard.ts.
    r.addHook("preHandler", app.requireAdmin);
    r.get(`${prefix}/admin/bookings`, async (req) => {
      const { status } = parse(z.object({ status: z.enum(homeBookingStatuses).optional() }), req.query);
      return { bookings: await svc.adminBookings(status) };
    });
    r.get(`${prefix}/admin/bookings/alerts`, async () => ({ bookings: await svc.adminAlerts() }));
    r.post(`${prefix}/admin/bookings/:id/auto-assign`, async (req) => ({ booking: await svc.adminRedispatch(parse(idParam, req.params).id) }));
    r.post(`${prefix}/admin/bookings/:id/assign`, async (req) => {
      const { proId } = parse(z.object({ proId: z.string().uuid() }), req.body);
      return { booking: await svc.adminAssign(parse(idParam, req.params).id, proId) };
    });
    r.post(`${prefix}/admin/bookings/:id/cancel`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
      return { booking: await svc.adminCancel(parse(idParam, req.params).id, reason) };
    });
    r.get(`${prefix}/admin/bookings/:id/invoice.pdf`, async (req, reply) => sendPdf(reply, await invoices.pdf(parse(idParam, req.params).id), true));
    r.get(`${prefix}/admin/reviews`, async (req) => {
      const q = parse(z.object({ hidden: z.enum(["true", "false"]).optional(), maxRating: z.coerce.number().int().min(1).max(5).optional() }), req.query);
      return { reviews: await reviews.adminList({ hidden: q.hidden === undefined ? undefined : q.hidden === "true", maxRating: q.maxRating }) };
    });
    r.post(`${prefix}/admin/reviews/:id/hide`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
      return { review: await reviews.setHidden(req.adminId!, parse(idParam, req.params).id, true, reason) };
    });
    r.post(`${prefix}/admin/reviews/:id/unhide`, async (req) => ({ review: await reviews.setHidden(req.adminId!, parse(idParam, req.params).id, false) }));
    r.get(`${prefix}/admin/pros`, async () => ({ pros: await partners.list() }));
    r.patch(`${prefix}/admin/pros/:id`, async (req) => {
      // active = approve a submitted profile or re-activate a suspended one.
      const { status } = parse(z.object({ status: z.enum(["active", "suspended"]) }), req.body);
      return { pro: await partners.setStatus(req.adminId!, parse(idParam, req.params).id, status) };
    });
    r.post(`${prefix}/admin/pros/:id/reject`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(200) }), req.body);
      return { pro: await partners.reject(req.adminId!, parse(idParam, req.params).id, reason) };
    });
    r.get(`${prefix}/admin/pros/:id/documents/:kind`, async (req, reply) => {
      const { id, kind } = parse(docParam.required({ id: true }), req.params);
      const doc = await partners.document(id!, kind);
      // Never cached, never sniffed: these are ID documents.
      return reply
        .header("content-type", doc.mime)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .header("content-disposition", `inline; filename="${kind}"`)
        .send(doc.data);
    });

    // ----- Commission, earnings and payouts -----
    r.get(`${prefix}/admin/categories`, async () => ({ categories: await svc.adminCategories() }));
    r.patch(`${prefix}/admin/categories/:id`, async (req) => {
      const { commissionBps } = parse(z.object({ commissionBps: z.number().int().min(0).max(5000) }), req.body);
      return { category: await svc.adminSetCommission(parse(idParam, req.params).id, commissionBps) };
    });
    r.get(`${prefix}/admin/payouts`, async () => earnings.balances());
    r.get(`${prefix}/admin/pros/:id/ledger`, async (req) => earnings.earnings(parse(idParam, req.params).id));
    r.post(`${prefix}/admin/pros/:id/payouts`, async (req, reply) => {
      const b = parse(z.object({ amountPaise: z.number().int().positive().max(10_000_000), note: z.string().trim().max(200).optional() }), req.body);
      return reply.code(201).send({ payout: await earnings.createPayout(req.adminId!, parse(idParam, req.params).id, b.amountPaise, b.note) });
    });
    r.post(`${prefix}/admin/payouts/:id/paid`, async (req) => {
      const { utr } = parse(z.object({ utr: z.string().trim().min(6).max(40) }), req.body);
      return { payout: await earnings.markPaid(parse(idParam, req.params).id, utr) };
    });
    r.post(`${prefix}/admin/payouts/:id/failed`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
      return { payout: await earnings.markFailed(parse(idParam, req.params).id, reason) };
    });
    r.post(`${prefix}/admin/pros/:id/adjustments`, async (req) => {
      const b = parse(z.object({ amountPaise: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0, "Amount can't be zero"), note: z.string().trim().min(3).max(200) }), req.body);
      return { balancePaise: await earnings.adjust(req.adminId!, parse(idParam, req.params).id, b.amountPaise, b.note) };
    });
    r.get(`${prefix}/admin/policy`, async () => ({ policy: await policy.get() }));
    r.put(`${prefix}/admin/policy`, async (req) => ({ policy: await policy.set(req.adminId!, (req.body ?? {}) as HomePolicyInput) }));
    r.get(`${prefix}/admin/services`, async () => ({ services: await svc.adminServices() }));
    r.patch(`${prefix}/admin/services/:id`, async (req) => {
      const patch = parse(
        z.object({ pricePaise: z.number().int().min(1000).max(10_000_000).optional(), active: z.boolean().optional() })
          .refine((p) => p.pricePaise !== undefined || p.active !== undefined, "Nothing to change"),
        req.body,
      );
      return { service: await svc.adminUpdateService(parse(idParam, req.params).id, patch) };
    });
  });

  // ----- RazorpayX payout webhook (signed; no login) -----
  app.post(`${prefix}/payouts/webhook`, async (req) => {
    if (!req.rawBody) throw new AppError(400, "invalid_body", "Empty body");
    return earnings.webhook(req.rawBody, req.headers);
  });
}
