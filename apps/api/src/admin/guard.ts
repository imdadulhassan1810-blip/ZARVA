import type { FastifyInstance, FastifyRequest } from "fastify";
import { adminCreateSchema, adminLoginSchema, adminPasswordChangeSchema, refreshSchema } from "@zarva/core";
import { z } from "zod";
import { verifyAccessToken } from "../auth/tokens";
import { AppError, unauthorized } from "../lib/errors";
import { parse } from "../lib/validate";

/**
 * The admin app. Who is an admin is decided on the server for every admin request:
 *  1. an admin access token (only /v1/admin/auth/login issues those: username + password + authenticator code),
 *  2. its admin session is live (not logged out, under 12 hours old),
 *  3. the admin account is still active.
 * Customer and partner tokens are refused here, and admin tokens are refused everywhere else.
 */
export function registerAdminGuard(app: FastifyInstance) {
  const admins = app.services.admins;

  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw unauthorized();
    let claims;
    try {
      claims = await verifyAccessToken(app.config.JWT_SECRET, h.slice(7));
    } catch {
      throw unauthorized("Session expired");
    }
    if (claims.portal !== "admin") throw new AppError(403, "wrong_portal", "Admins only. Sign in on the ZARVA admin page.");
    if (!(await admins.isSessionActive(claims.sessionId, claims.subjectId))) throw unauthorized("Session ended");
    req.adminId = claims.subjectId;
    req.sessionId = claims.sessionId;
  });

  app.post("/v1/admin/auth/login", async (req) => admins.login(parse(adminLoginSchema, req.body)));
  app.post("/v1/admin/auth/refresh", async (req) => admins.refresh(parse(refreshSchema, req.body).refreshToken));
  app.post("/v1/admin/auth/logout", async (req, reply) => {
    await admins.logout(parse(refreshSchema, req.body).refreshToken);
    return reply.code(204).send();
  });

  app.register(async (r) => {
    r.addHook("preHandler", app.requireAdmin);
    r.get("/v1/admin/me", async (req) => ({ admin: await admins.get(req.adminId!) }));
    r.post("/v1/admin/me/password", async (req, reply) => {
      const b = parse(adminPasswordChangeSchema, req.body);
      await admins.changePassword(req.adminId!, req.sessionId!, b.currentPassword, b.newPassword);
      return reply.code(204).send();
    });
    // The team: only an admin can add another admin. There is no sign-up.
    r.get("/v1/admin/team", async () => ({ admins: await admins.list() }));
    r.post("/v1/admin/team", async (req, reply) => reply.code(201).send(await admins.create(req.adminId!, parse(adminCreateSchema, req.body))));
    r.patch("/v1/admin/team/:id", async (req) => {
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const { status } = parse(z.object({ status: z.enum(["active", "disabled"]) }), req.body);
      return { admin: await admins.setStatus(req.adminId!, id, status) };
    });
  });
}
