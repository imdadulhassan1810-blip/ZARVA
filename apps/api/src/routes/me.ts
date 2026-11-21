import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  addressInputSchema, addressUpdateSchema, linkEmailRequestSchema, linkEmailVerifySchema, linkPhoneRequestSchema, linkPhoneVerifySchema,
  profileUpdateSchema, type Address,
} from "@zarva/core";
import { z } from "zod";
import { toPublicUser } from "../auth/service";
import { addresses, users } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { parse } from "../lib/validate";

const MAX_ADDRESSES = 20;
const idParam = z.object({ id: z.string().uuid() });

function toAddress(a: typeof addresses.$inferSelect): Address {
  const { userId: _u, deletedAt: _d, createdAt: _c, updatedAt: _up, ...rest } = a;
  return rest;
}

export async function meRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireCustomer);

  app.get("/v1/me", async (req) => {
    const u = await app.db.query.users.findFirst({ where: eq(users.id, req.userId!) });
    if (!u) throw notFound("User");
    return { user: toPublicUser(u) };
  });

  app.patch("/v1/me", async (req) => {
    const patch = parse(profileUpdateSchema, req.body);
    const [u] = await app.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, req.userId!)).returning();
    return { user: toPublicUser(u!) };
  });

  // Add a mobile number or email to the account (e.g. after signing up with Google).
  app.post("/v1/me/phone/request", async (req) => {
    const { phone } = parse(linkPhoneRequestSchema, req.body);
    const target = { kind: "phone" as const, value: phone };
    await app.services.auth.assertLinkable(req.userId!, target);
    const r = await app.services.auth.requestCode(target, req.ip);
    return { sent: true, retryAfter: r.retryAfter };
  });
  app.post("/v1/me/phone/verify", async (req) => {
    const { phone, code } = parse(linkPhoneVerifySchema, req.body);
    return { user: await app.services.auth.linkWithCode(req.userId!, { kind: "phone", value: phone }, code) };
  });
  app.post("/v1/me/email/request", async (req) => {
    const { email } = parse(linkEmailRequestSchema, req.body);
    const target = { kind: "email" as const, value: email };
    await app.services.auth.assertLinkable(req.userId!, target);
    const r = await app.services.auth.requestCode(target, req.ip);
    return { sent: true, retryAfter: r.retryAfter };
  });
  app.post("/v1/me/email/verify", async (req) => {
    const { email, code } = parse(linkEmailVerifySchema, req.body);
    return { user: await app.services.auth.linkWithCode(req.userId!, { kind: "email", value: email }, code) };
  });

  app.get("/v1/me/addresses", async (req) => {
    const rows = await app.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, req.userId!), isNull(addresses.deletedAt)))
      .orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
    return { addresses: rows.map(toAddress) };
  });

  app.post("/v1/me/addresses", async (req, reply) => {
    const input = parse(addressInputSchema, req.body);
    const userId = req.userId!;
    const row = await app.db.transaction(async (tx) => {
      const existing = await tx.select({ id: addresses.id }).from(addresses).where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
      if (existing.length >= MAX_ADDRESSES) throw badRequest("address_limit", `You can save up to ${MAX_ADDRESSES} addresses`);
      const makeDefault = input.isDefault || existing.length === 0;
      if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
      const [r] = await tx.insert(addresses).values({ ...input, userId, isDefault: makeDefault }).returning();
      return r!;
    });
    return reply.code(201).send({ address: toAddress(row) });
  });

  app.patch("/v1/me/addresses/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(addressUpdateSchema, req.body);
    const userId = req.userId!;
    const row = await app.db.transaction(async (tx) => {
      const where = and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt));
      const found = await tx.select({ id: addresses.id }).from(addresses).where(where);
      if (found.length === 0) throw notFound("Address");
      if (patch.isDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
      const [r] = await tx.update(addresses).set({ ...patch, updatedAt: new Date() }).where(where).returning();
      return r!;
    });
    return { address: toAddress(row) };
  });

  app.delete("/v1/me/addresses/:id", async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const userId = req.userId!;
    await app.db.transaction(async (tx) => {
      const [r] = await tx
        .update(addresses)
        .set({ deletedAt: new Date(), isDefault: false })
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .returning({ wasDefault: addresses.isDefault });
      if (!r) throw notFound("Address");
      // Promote the oldest remaining address to default so there is always one.
      const [next] = await tx
        .select({ id: addresses.id, isDefault: addresses.isDefault })
        .from(addresses)
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .orderBy(desc(addresses.isDefault), asc(addresses.createdAt))
        .limit(1);
      if (next && !next.isDefault) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    });
    return reply.code(204).send();
  });
}
