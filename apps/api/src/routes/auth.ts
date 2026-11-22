import type { FastifyInstance } from "fastify";
import type { AuthProviders } from "@zarva/core";
import { appleLoginSchema, googleLoginSchema, refreshSchema, requestEmailCodeSchema, requestOtpSchema, verifyEmailCodeSchema, verifyOtpSchema } from "@zarva/core";
import { parse } from "../lib/validate";

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/otp/request", async (req) => {
    const { phone } = parse(requestOtpSchema, req.body);
    const r = await app.services.auth.requestOtp(phone, req.ip);
    return { sent: true, retryAfter: r.retryAfter };
  });

  app.post("/v1/auth/otp/verify", async (req) => {
    const { phone, code, deviceName, portal } = parse(verifyOtpSchema, req.body);
    return app.services.auth.verifyOtp(phone, code, deviceName ?? req.headers["user-agent"]?.slice(0, 80), portal);
  });

  app.get("/v1/auth/providers", async (): Promise<AuthProviders> => {
    const mode = app.services.auth.googleMode;
    const clientId = mode === "live" ? (app.config.GOOGLE_CLIENT_ID.split(",")[0]?.trim() ?? null) : null;
    const appleMode = app.services.auth.appleMode;
    const appleIds = app.config.APPLE_CLIENT_IDS.split(",").map((s) => s.trim()).filter(Boolean);
    const serviceId = appleMode === "live" ? (app.config.APPLE_WEB_SERVICE_ID.trim() || appleIds[appleIds.length - 1] || null) : null;
    return { phone: true, email: true, google: { mode, clientId }, apple: { mode: appleMode, serviceId } };
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

  app.post("/v1/auth/apple", async (req) => {
    const { identityToken, name, deviceName } = parse(appleLoginSchema, req.body);
    return app.services.auth.loginWithApple(identityToken, name, deviceName ?? req.headers["user-agent"]?.slice(0, 80));
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
