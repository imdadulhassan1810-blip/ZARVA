import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("pglite"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("local-dev-only-secret-change-me-before-deploying"),
  OTP_PROVIDER: z.enum(["console", "msg91", "memory"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  /** "console" prints email codes to the API terminal (dev). "resend" sends real email. */
  EMAIL_PROVIDER: z.enum(["console", "resend", "memory"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /**
   * Google OAuth "Web application" client id(s), comma-separated. When empty, development uses a
   * demo Google button (no keys needed) and production hides Google sign-in.
   */
  GOOGLE_CLIENT_ID: z.string().default(""),
  /**
   * Sign in with Apple audiences, comma-separated: the iOS bundle id (in.zarva.app) and the web
   * Services ID (e.g. in.zarva.web). The first Services-style id (one that is not the bundle id)
   * is sent to the website. When empty, development uses a demo Apple button and production hides it.
   */
  APPLE_CLIENT_IDS: z.string().default(""),
  /** The website's Sign in with Apple Services ID (shown to the browser). Defaults to the last APPLE_CLIENT_IDS entry. */
  APPLE_WEB_SERVICE_ID: z.string().default(""),
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  RAZORPAY_KEY_ID: z.string().optional(),
  /**
   * On a live server, "Pay online" is switched off while Razorpay has test keys (rzp_test_...),
   * because customers would see "Paid" while no money moves. Set to true only on a private test site.
   */
  ALLOW_TEST_PAYMENTS: z.enum(["true", "false"]).default("false"),
  /** Home services is the launch vertical, so it is on unless you override this. */
  ENABLED_MODULES: z.string().default("home"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
  /** The customer website, used in links inside messages. */
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Booking updates. "console" prints them in the API terminal (dev). "off" sends nothing.
   * SMS needs DLT-registered templates (see docs/notifications.md); WhatsApp needs Meta-approved templates.
   */
  SMS_PROVIDER: z.enum(["console", "msg91", "memory", "off"]).default("console"),
  /** "booking_confirmed:<msg91 template id>,pro_assigned:<id>,..." */
  MSG91_SMS_TEMPLATES: z.string().default(""),
  WHATSAPP_PROVIDER: z.enum(["console", "meta", "memory", "off"]).default("console"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default("en"),

  /** "manual": admin pays by UPI and records the reference. "razorpayx": automatic, after Razorpay KYC. */
  PAYOUT_PROVIDER: z.enum(["manual", "razorpayx"]).default("manual"),
  /** Encrypts KYC documents in the database. 32+ random characters; never change it once set. */
  /** Sign-in codes one internet address may request per hour (SMS + email). */
  CODE_LIMIT_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  /** SMS sign-in codes the whole platform may send per hour: a ceiling on the SMS bill. Raise it as you grow. */
  SMS_CODE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(500),
  KYC_ENCRYPTION_KEY: z.string().min(32, "KYC_ENCRYPTION_KEY must be at least 32 characters").optional(),
  /**
   * Printed on customer invoices. Without INVOICE_GSTIN the PDF is a payment receipt, not a GST tax
   * invoice (an unregistered business must not issue one). Set it once ZARVA has its GST number.
   */
  INVOICE_LEGAL_NAME: z.string().default("ZARVA"),
  INVOICE_ADDRESS: z.string().default("Durgapur, West Bengal"),
  INVOICE_STATE: z.string().default("West Bengal"),
  INVOICE_GSTIN: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "INVOICE_GSTIN must be a 15-character GSTIN, e.g. 19ABCDE1234F1Z5").optional(),
  INVOICE_SUPPORT_CONTACT: z.string().default("Help & support in the ZARVA app"),
});
export type Config = z.infer<typeof envSchema> & {
  /**
   * True only on a developer's own machine: not production, AND sign-in codes are printed to the
   * terminal instead of sent. A server that texts or emails real people is a real deployment, so
   * every shortcut (demo admin, demo Google button, instant mock payments, demo pros) switches off
   * there even if NODE_ENV was forgotten.
   */
  devShortcuts: boolean;
  /** Whether customers may choose "Pay online". Off on a live server with Razorpay test keys. */
  onlinePayments: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat blank lines in .env ("JWT_SECRET=") as unset so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const base = envSchema.parse(cleaned);
  if (base.NODE_ENV === "production") {
    if (base.OTP_PROVIDER !== "msg91") throw new Error("Production must use a real OTP provider");
    if (base.JWT_SECRET.startsWith("local-dev-only")) throw new Error("Set a real JWT_SECRET in production");
    if (base.EMAIL_PROVIDER !== "resend") throw new Error("Production must send real email (EMAIL_PROVIDER=resend)");
    if (base.DATABASE_URL.startsWith("pglite")) throw new Error("Production must use PostgreSQL, not the demo database");
    if (base.PUBLIC_WEB_URL.includes("localhost")) throw new Error("Set PUBLIC_WEB_URL to your website address in production");
    // Without this the website's requests to the API are blocked by the browser.
    if (!cleaned.CORS_ORIGINS || base.CORS_ORIGINS.includes("localhost")) throw new Error("Set CORS_ORIGINS to your website address in production, e.g. https://zarva.in");
  }
  const codesStayLocal = base.OTP_PROVIDER !== "msg91" && base.EMAIL_PROVIDER !== "resend";
  const devShortcuts = base.NODE_ENV !== "production" && codesStayLocal;

  if (!devShortcuts) {
    if (base.JWT_SECRET.startsWith("local-dev-only")) throw new Error("Real SMS/email is configured: set a real JWT_SECRET");
    // The mock provider's signing key is public (it's in this repo): anyone could fake "paid".
    if (base.PAYMENT_PROVIDER === "mock") throw new Error("Real SMS/email is configured: PAYMENT_PROVIDER must be razorpay");
    // Customers' phone numbers and messages must not pile up in a server log.
    if (base.SMS_PROVIDER === "console" || base.SMS_PROVIDER === "memory") throw new Error("Real deployment: set SMS_PROVIDER to msg91 (or off until DLT is approved)");
    if (base.WHATSAPP_PROVIDER === "console" || base.WHATSAPP_PROVIDER === "memory") throw new Error("Real deployment: set WHATSAPP_PROVIDER to meta (or off)");
    if (!base.KYC_ENCRYPTION_KEY) throw new Error("Real deployment: set KYC_ENCRYPTION_KEY (32+ random characters) to protect partner ID documents");
  }

  // Admins are no longer configured here: they are ZARVA-issued accounts (pnpm admin:create, or the admin Team tab).
  for (const old of ["ADMIN_PHONES", "ADMIN_TOTP_SECRETS"]) {
    if (cleaned[old]) console.warn(`${old} is no longer used. Create admin logins with: pnpm admin:create <username> "<Full name>"`);
  }
  const testKeys = base.PAYMENT_PROVIDER === "razorpay" && (base.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");
  const onlinePayments = !(testKeys && base.NODE_ENV === "production" && base.ALLOW_TEST_PAYMENTS !== "true");
  return { ...base, devShortcuts, onlinePayments };
}

/** Local demo admin, created on a developer's machine only (see server.ts). */
export const DEV_ADMIN = { username: "admin", password: "zarva-admin-dev", name: "Demo admin" } as const;
