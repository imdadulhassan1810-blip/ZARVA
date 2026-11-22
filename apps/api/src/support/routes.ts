import type { FastifyInstance } from "fastify";
import { feedbackSchema, supportCreateSchema, supportReplySchema, supportStatuses } from "@zarva/core";
import { z } from "zod";
import { parse } from "../lib/validate";

const idParam = z.object({ id: z.string().uuid() });

/** Help & support: customer tickets and feedback (customer app), and the team's queue (admin app). */
export async function supportRoutes(app: FastifyInstance) {
  const svc = app.services.support;

  await app.register(async (r) => {
    r.addHook("preHandler", app.requireCustomer);
    r.post("/v1/support/tickets", async (req, reply) => reply.code(201).send({ ticket: await svc.create(req.userId!, parse(supportCreateSchema, req.body)) }));
    r.get("/v1/support/tickets", async (req) => {
      const q = parse(z.object({ module: z.enum(["home"]).optional(), referenceId: z.string().uuid().optional() }), req.query);
      return { tickets: q.module && q.referenceId ? await svc.forReference(req.userId!, q.module, q.referenceId) : await svc.mine(req.userId!) };
    });
    r.get("/v1/support/tickets/:id", async (req) => ({ ticket: await svc.get(req.userId!, parse(idParam, req.params).id) }));
    r.post("/v1/support/tickets/:id/messages", async (req) => ({
      ticket: await svc.customerReply(req.userId!, parse(idParam, req.params).id, parse(supportReplySchema, req.body).message),
    }));
    r.post("/v1/support/tickets/:id/resolve", async (req) => ({ ticket: await svc.customerResolve(req.userId!, parse(idParam, req.params).id) }));
    r.post("/v1/support/feedback", async (req, reply) => reply.code(201).send(await svc.sendFeedback(req.userId!, parse(feedbackSchema, req.body))));
  });

  await app.register(async (r) => {
    r.addHook("preHandler", app.requireAdmin);
    r.get("/v1/admin/support/tickets", async (req) => {
      const { status } = parse(z.object({ status: z.enum(supportStatuses).optional() }), req.query);
      return svc.adminList(status);
    });
    r.get("/v1/admin/support/tickets/:id", async (req) => ({ ticket: await svc.adminGet(parse(idParam, req.params).id) }));
    r.post("/v1/admin/support/tickets/:id/messages", async (req) => {
      const b = parse(supportReplySchema.extend({ resolve: z.boolean().default(false) }), req.body);
      return { ticket: await svc.adminReply(req.adminId!, parse(idParam, req.params).id, b.message, b.resolve) };
    });
    r.patch("/v1/admin/support/tickets/:id", async (req) => {
      const { status } = parse(z.object({ status: z.enum(supportStatuses) }), req.body);
      return { ticket: await svc.adminSetStatus(req.adminId!, parse(idParam, req.params).id, status) };
    });
    r.get("/v1/admin/feedback", async () => ({ feedback: await svc.adminFeedback() }));
  });
}
