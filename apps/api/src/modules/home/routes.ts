import type { FastifyInstance } from "fastify";
import { homeBookingStatuses, homeCreateBookingSchema, homeProApplySchema } from "@zarva/core";
import { z } from "zod";
import { parse } from "../../lib/validate";
import type { HomeServicesService } from "./service";

const idParam = z.object({ id: z.string().uuid() });
const confirmSchema = z.object({
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

export function homeRoutes(app: FastifyInstance, prefix: string, svc: HomeServicesService) {
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

  // ----- Signed-in customer -----
  app.register(async (r) => {
    r.addHook("preHandler", app.requireAuth);

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
      return { booking: await svc.get(req.userId!, id) };
    });
    r.post(`${prefix}/bookings/:id/cancel`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {});
      return { booking: await svc.cancel(req.userId!, parse(idParam, req.params).id, reason) };
    });

    // ----- Service professional -----
    r.get(`${prefix}/pro/me`, async (req) => ({ pro: await svc.proMe(req.userId!) }));
    r.post(`${prefix}/pro/apply`, async (req, reply) => reply.code(201).send({ pro: await svc.applyPro(req.userId!, parse(homeProApplySchema, req.body)) }));
    r.get(`${prefix}/pro/jobs`, async (req) => svc.proJobs(req.userId!));
    r.post(`${prefix}/pro/jobs/:id/accept`, async (req) => ({ booking: await svc.accept(req.userId!, parse(idParam, req.params).id) }));
    r.post(`${prefix}/pro/jobs/:id/status`, async (req) => {
      const body = parse(z.object({ status: z.enum(["on_the_way", "in_progress", "completed"]), startCode: z.string().regex(/^\d{4}$/).optional() }), req.body);
      return { booking: await svc.proUpdate(req.userId!, parse(idParam, req.params).id, body.status, body.startCode) };
    });
  });

  // ----- Admin (phones listed in ADMIN_PHONES) -----
  app.register(async (r) => {
    // Every admin route: signed in + verified phone in ADMIN_PHONES + authenticator code. See admin/guard.ts.
    r.addHook("preHandler", app.requireAdmin);
    r.get(`${prefix}/admin/bookings`, async (req) => {
      const { status } = parse(z.object({ status: z.enum(homeBookingStatuses).optional() }), req.query);
      return { bookings: await svc.adminBookings(status) };
    });
    r.post(`${prefix}/admin/bookings/:id/assign`, async (req) => {
      const { proId } = parse(z.object({ proId: z.string().uuid() }), req.body);
      return { booking: await svc.adminAssign(parse(idParam, req.params).id, proId) };
    });
    r.post(`${prefix}/admin/bookings/:id/cancel`, async (req) => {
      const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
      return { booking: await svc.adminCancel(parse(idParam, req.params).id, reason) };
    });
    r.get(`${prefix}/admin/pros`, async () => ({ pros: await svc.adminPros() }));
    r.patch(`${prefix}/admin/pros/:id`, async (req) => {
      const { status } = parse(z.object({ status: z.enum(["pending", "active", "suspended"]) }), req.body);
      return { pro: await svc.adminSetProStatus(parse(idParam, req.params).id, status) };
    });
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
}
