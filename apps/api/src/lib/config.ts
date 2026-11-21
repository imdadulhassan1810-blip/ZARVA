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
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  /** Home services is the launch vertical, so it is on unless you override this. */
  ENABLED_MODULES: z.string().default("home"),
  /** Comma-separated mobile numbers allowed into admin screens, e.g. "9876543210,9123456780". */
  ADMIN_PHONES: z.string().default(""),
  /**
   * Second factor for admins: authenticator-app secrets, "9876543210:BASE32SECRET,9123456780:BASE32SECRET".
   * Required for every admin on a real deployment. Generate one with `pnpm admin:2fa 9876543210`.
   */
  ADMIN_TOTP_SECRETS: z.string().default(""),
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
  KYC_ENCRYPTION_KEY: z.string().min(32, "KYC_ENCRYPTION_KEY must be at least 32 characters").optional(),
});
export type Config = z.infer<typeof envSchema> & {
  /**
   * True only on a developer's own machine: not production, AND sign-in codes are printed to the
   * terminal instead of sent. A server that texts or emails real people is a real deployment, so
   * every shortcut (demo admin, demo Google button, instant mock payments, demo pros) switches off
   * there even if NODE_ENV was forgotten.
   */
  devShortcuts: boolean;
  /** Admin phones, E.164. */
  adminPhones: string[];
  /** E.164 phone -> base32 TOTP secret. */
  adminTotp: Map<string, string>;
};

const PHONE = /^(?:\+91|91|0)?([6-9]\d{9})$/;
const BASE32 = /^[A-Z2-7]{16,}=*$/;

function parsePhoneList(raw: string, name: string): string[] {
  return raw.split(",").map((s) => s.trim().replace(/[\s-]/g, "")).filter(Boolean).map((s) => {
    const m = PHONE.exec(s);
    if (!m) throw new Error(`${name}: "${s}" is not a valid Indian mobile number`);
    return `+91${m[1]}`;
  });
}

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

  // Local convenience only: sign in as 99999 00000 to open /admin.
  const adminRaw = base.ADMIN_PHONES || (devShortcuts && base.NODE_ENV === "development" ? DEV_ADMIN_PHONE : "");
  const adminPhones = parsePhoneList(adminRaw, "ADMIN_PHONES");

  const adminTotp = new Map<string, string>();
  for (const entry of base.ADMIN_TOTP_SECRETS.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [phoneRaw, secretRaw] = entry.split(":");
    const [phone] = parsePhoneList(phoneRaw ?? "", "ADMIN_TOTP_SECRETS");
    const secret = (secretRaw ?? "").toUpperCase().replace(/\s/g, "");
    if (!phone || !BASE32.test(secret)) throw new Error(`ADMIN_TOTP_SECRETS: "${phoneRaw}" needs a base32 secret (pnpm admin:2fa <phone>)`);
    adminTotp.set(phone, secret);
  }
  if (!devShortcuts) {
    const missing = adminPhones.filter((p) => !adminTotp.has(p));
    if (missing.length) throw new Error(`Every admin needs an authenticator secret in ADMIN_TOTP_SECRETS. Missing: ${missing.join(", ")}`);
  }

  return { ...base, ADMIN_PHONES: adminRaw, devShortcuts, adminPhones, adminTotp };
}

export const DEV_ADMIN_PHONE = "9999900000";
