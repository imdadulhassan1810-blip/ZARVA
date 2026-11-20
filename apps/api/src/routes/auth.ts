import type { FastifyInstance } from "fastify";
import { refreshSchema, requestOtpSchema, verifyOtpSchema } from "@zarva/core";
import { parse } from "../lib/validate";

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/otp/request", async (req) => {
    const { phone } = parse(requestOtpSchema, req.body);
    const r = await app.services.auth.requestOtp(phone, req.ip);
    return { sent: true, retryAfter: r.retryAfter };
  });

  app.post("/v1/auth/otp/verify", async (req) => {
    const { phone, code, deviceName } = parse(verifyOtpSchema, req.body);
    return app.services.auth.verifyOtp(phone, code, deviceName ?? req.headers["user-agent"]?.slice(0, 80));
  });

  app.post("/v1/auth/refresh", async (req) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    return app.services.auth.refresh(refreshToken);
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    await app.services.auth.logout(refreshToken);
    return reply.code(204).send();
  });
}
