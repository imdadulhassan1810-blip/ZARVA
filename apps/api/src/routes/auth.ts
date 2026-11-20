import type { FastifyInstance } from "fastify";
import type { AuthProviders } from "@zarva/core";
import { googleLoginSchema, refreshSchema, requestEmailCodeSchema, requestOtpSchema, verifyEmailCodeSchema, verifyOtpSchema } from "@zarva/core";
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

  app.get("/v1/auth/providers", async (): Promise<AuthProviders> => {
    const mode = app.services.auth.googleMode;
    const clientId = mode === "live" ? (app.config.GOOGLE_CLIENT_ID.split(",")[0]?.trim() ?? null) : null;
    return { phone: true, email: true, google: { mode, clientId } };
  });

  app.post("/v1/auth/email/request", async (req) => {
    const { email } = parse(requestEmailCodeSchema, req.body);
    const r = await app.services.auth.requestCode({ kind: "email", value: email }, req.ip);
    return { sent: true, retryAfter: r.retryAfter };
  });

  app.post("/v1/auth/email/verify", async (req) => {
    const { email, code, deviceName } = parse(verifyEmailCodeSchema, req.body);
    return app.services.auth.loginWithCode({ kind: "email", value: email }, code, deviceName ?? req.headers["user-agent"]?.slice(0, 80));
  });

  app.post("/v1/auth/google", async (req) => {
    const { idToken, deviceName } = parse(googleLoginSchema, req.body);
    return app.services.auth.loginWithGoogle(idToken, deviceName ?? req.headers["user-agent"]?.slice(0, 80));
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
