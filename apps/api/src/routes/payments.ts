import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { payments } from "../db/schema";
import { notFound } from "../lib/errors";
import { parse } from "../lib/validate";

const confirmSchema = z.object({
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

function publicPayment(p: typeof payments.$inferSelect) {
  return {
    id: p.id, module: p.module, referenceId: p.referenceId, amountPaise: p.amountPaise, refundedPaise: p.refundedPaise,
    status: p.status, method: p.method, createdAt: p.createdAt.toISOString(),
  };
}

export async function paymentRoutes(app: FastifyInstance) {
  // Webhook: no user auth, verified by provider signature on the raw body.
  app.post("/v1/payments/webhook/:provider", async (req) => {
    const r = await app.services.payments.handleWebhook(req.rawBody ?? "", req.headers);
    return { ok: true, duplicate: r.duplicate };
  });

  app.register(async (authed) => {
    authed.addHook("preHandler", app.requireAuth);
    authed.post("/v1/payments/confirm", async (req) => {
      const c = parse(confirmSchema, req.body);
      return { payment: publicPayment(await app.services.payments.confirmFromClient(req.userId!, c)) };
    });
    authed.get("/v1/payments/:id", async (req) => {
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const p = await app.db.query.payments.findFirst({ where: and(eq(payments.id, id), eq(payments.userId, req.userId!)) });
      if (!p) throw notFound("Payment");
      return { payment: publicPayment(p) };
    });
  });
}
