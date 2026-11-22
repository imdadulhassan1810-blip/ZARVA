import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { parseEnabledModules, type ModuleStatus } from "@zarva/core";
import { InvalidSignatureError, ManualPayoutProvider, MockProvider, type PaymentProvider, type PayoutProvider } from "@zarva/payments";
import { AuthService } from "./auth/service";
import type { OtpSender } from "./auth/otp-sender";
import { ConsoleEmailSender, type EmailSender } from "./auth/email-sender";
import { LiveGoogleVerifier, MockGoogleVerifier, type GoogleVerifier } from "./auth/google";
import { LiveAppleVerifier, MockAppleVerifier, type AppleVerifier } from "./auth/apple";
import { verifyAccessToken } from "./auth/tokens";
import type { Db } from "./db/client";
import { AppError, unauthorized } from "./lib/errors";
import type { Config } from "./lib/config";
import { buildRegistry } from "./modules";
import { PaymentService } from "./payments/service";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { paymentRoutes } from "./routes/payments";
import { registerAdminGuard } from "./admin/guard";
import { AdminAccountService } from "./admin/accounts";
import { channelsFromConfig, NotificationService, type MessageChannel, type NotifyChannel } from "./notify";
import { Vault } from "./lib/vault";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: Config;
    services: {
      auth: AuthService;
      payments: PaymentService;
      /** SMS + WhatsApp updates (outbox). */
      notify: NotificationService;
      /** Money out to service professionals. */
      payouts: PayoutProvider;
      /** Encrypts KYC documents at rest. */
      vault: Vault;
      /** ZARVA team accounts (admin app). */
      admins: AdminAccountService;
    };
    /** A session opened in the customer app. Sets req.userId. */
    requireCustomer: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** A session opened in the partner app. Sets req.userId. */
    requirePartner: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** A ZARVA team session (username + password + authenticator). Sets req.adminId. See admin/guard.ts. */
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Current time. Injected so tests can move the clock. */
    now: () => Date;
  }
  interface FastifyRequest {
    userId?: string;
    adminId?: string;
    sessionId?: string;
    rawBody?: string;
  }
}

export interface AppDeps {
  db: Db;
  config: Config;
  otpSender: OtpSender;
  emailSender?: EmailSender;
  /** Defaults from config: live with GOOGLE_CLIENT_ID, demo in development without it, off in production without it. */
  googleVerifier?: GoogleVerifier | null;
  /** Same rules as Google, from APPLE_CLIENT_IDS. */
  appleVerifier?: AppleVerifier | null;
  paymentProvider: PaymentProvider;
  /** Defaults from SMS_PROVIDER / WHATSAPP_PROVIDER. */
  notifyChannels?: Partial<Record<NotifyChannel, MessageChannel>>;
  /** Defaults to manual payouts. */
  payoutProvider?: PayoutProvider;
  logger?: boolean;
  now?: () => Date;
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
  // List the methods: @fastify/cors 11 only allows GET, HEAD and POST by default, which would block
  // the website's PUT / PATCH / DELETE calls (partner uploads, profile and address edits).
  await app.register(cors, {
    origin: deps.config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  const googleIds = deps.config.GOOGLE_CLIENT_ID.split(",").map((s) => s.trim()).filter(Boolean);
  const google =
    deps.googleVerifier !== undefined
      ? deps.googleVerifier
      : googleIds.length > 0
        ? new LiveGoogleVerifier(googleIds)
        : deps.config.devShortcuts
          ? new MockGoogleVerifier()
          : null;
  const appleIds = deps.config.APPLE_CLIENT_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  const apple =
    deps.appleVerifier !== undefined
      ? deps.appleVerifier
      : appleIds.length > 0
        ? new LiveAppleVerifier(appleIds)
        : deps.config.devShortcuts
          ? new MockAppleVerifier()
          : null;
  const auth = new AuthService({
    db: deps.db,
    secret: deps.config.JWT_SECRET,
    sms: deps.otpSender,
    email: deps.emailSender ?? new ConsoleEmailSender(),
    google,
    apple,
    now: deps.now,
    limits: { perIpPerHour: deps.config.CODE_LIMIT_PER_IP_PER_HOUR, smsPerHour: deps.config.SMS_CODE_LIMIT_PER_HOUR },
  });
  app.decorate("db", deps.db);
  app.decorate("config", deps.config);
  app.decorate("now", deps.now ?? (() => new Date()));
  const now = deps.now ?? (() => new Date());
  const notify = new NotificationService(deps.db, deps.notifyChannels ?? channelsFromConfig(deps.config), now);
  // Dev falls back to a key derived from JWT_SECRET; real deployments must set KYC_ENCRYPTION_KEY (config enforces it).
  const vault = new Vault(deps.config.KYC_ENCRYPTION_KEY ?? `dev:${deps.config.JWT_SECRET}`);
  const admins = new AdminAccountService(deps.db, vault, deps.config.JWT_SECRET, deps.config.devShortcuts, now);
  app.decorate("services", {
    auth, payments: new PaymentService(deps.db, deps.paymentProvider), notify, payouts: deps.payoutProvider ?? new ManualPayoutProvider(), vault, admins,
  });
  app.addHook("onClose", async () => notify.stop());
  // One person can use the customer app and the partner app (like an Uber rider who also drives),
  // but each sign-in opens only the app it was made in. The API refuses the other app's screens.
  const wrongPortal = {
    customer: "This is the customer app. Sign in on the customer page to use it.",
    partner: "This is the partner app. Sign in on the partner page to use it.",
  } as const;
  const userGuard = (portal: "customer" | "partner") => async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw unauthorized();
    let claims;
    try {
      claims = await verifyAccessToken(deps.config.JWT_SECRET, h.slice(7));
    } catch {
      throw unauthorized("Session expired");
    }
    if (claims.portal !== portal) throw new AppError(403, "wrong_portal", wrongPortal[portal]);
    req.userId = claims.subjectId;
    req.sessionId = claims.sessionId;
    // A logged-out device loses access immediately, not after the access token expires.
    if (!(await auth.isSessionActive(claims.sessionId, portal))) throw unauthorized("Session ended");
  };
  app.decorate("requireCustomer", userGuard("customer"));
  app.decorate("requirePartner", userGuard("partner"));

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
  registerAdminGuard(app);
  await app.register(meRoutes);
  await app.register(paymentRoutes);

  // Dev only: stands in for the Razorpay checkout sheet so the whole booking flow runs without keys.
  if (deps.paymentProvider instanceof MockProvider && deps.config.devShortcuts) {
    const mock = deps.paymentProvider;
    app.post("/v1/payments/mock/:providerOrderId/succeed", async (req) => {
      const { providerOrderId } = req.params as { providerOrderId: string };
      return { confirmation: mock.simulateSuccess(providerOrderId) };
    });
  }

  const statuses: ModuleStatus[] = await buildRegistry().mount(app, parseEnabledModules(deps.config.ENABLED_MODULES), (msg, extra) =>
    app.log.info(extra ?? {}, msg),
  );
  app.get("/v1/modules", async () => ({ modules: statuses }));

  return app;
}
