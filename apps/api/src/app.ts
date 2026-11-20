import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { parseEnabledModules, type ModuleStatus } from "@zarva/core";
import { InvalidSignatureError, type PaymentProvider } from "@zarva/payments";
import { AuthService } from "./auth/service";
import type { OtpSender } from "./auth/otp-sender";
import { verifyAccessToken } from "./auth/tokens";
import type { Db } from "./db/client";
import { AppError, unauthorized } from "./lib/errors";
import type { Config } from "./lib/config";
import { buildRegistry } from "./modules";
import { PaymentService } from "./payments/service";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { paymentRoutes } from "./routes/payments";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: Config;
    services: { auth: AuthService; payments: PaymentService };
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
    sessionId?: string;
    rawBody?: string;
  }
}

export interface AppDeps {
  db: Db;
  config: Config;
  otpSender: OtpSender;
  paymentProvider: PaymentProvider;
  logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true, bodyLimit: 256 * 1024 });

  // Keep the raw body: payment webhooks are signed over the exact bytes.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, "invalid_json", "Body is not valid JSON"), undefined);
    }
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.config.CORS_ORIGINS.split(",").map((s) => s.trim()) });

  const auth = new AuthService(deps.db, deps.config.JWT_SECRET, deps.otpSender);
  app.decorate("db", deps.db);
  app.decorate("config", deps.config);
  app.decorate("services", { auth, payments: new PaymentService(deps.db, deps.paymentProvider) });
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw unauthorized();
    try {
      const { userId, sessionId } = await verifyAccessToken(deps.config.JWT_SECRET, h.slice(7));
      req.userId = userId;
      req.sessionId = sessionId;
    } catch {
      throw unauthorized("Session expired");
    }
    // A logged-out device loses access immediately, not after the access token expires.
    if (!(await auth.isSessionActive(req.sessionId!))) throw unauthorized("Session ended");
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; details?: unknown }, req, reply) => {
    if (err instanceof InvalidSignatureError) {
      return reply.code(400).send({ error: { code: "invalid_signature", message: err.message } });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: err.code ?? "bad_request", message: err.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: "internal", message: "Something went wrong" } });
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(paymentRoutes);

  const statuses: ModuleStatus[] = await buildRegistry().mount(app, parseEnabledModules(deps.config.ENABLED_MODULES), (msg, extra) =>
    app.log.info(extra ?? {}, msg),
  );
  app.get("/v1/modules", async () => ({ modules: statuses }));

  return app;
}
