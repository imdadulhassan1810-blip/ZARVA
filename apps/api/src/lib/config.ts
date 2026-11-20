import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("pglite"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("local-dev-only-secret-change-me-before-deploying"),
  OTP_PROVIDER: z.enum(["console", "msg91", "memory"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  /** Home services is the launch vertical, so it is on unless you override this. */
  ENABLED_MODULES: z.string().default("home"),
  /** Comma-separated mobile numbers allowed into admin screens, e.g. "9876543210,9123456780". */
  ADMIN_PHONES: z.string().default(""),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
});
export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat blank lines in .env ("JWT_SECRET=") as unset so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const cfg = envSchema.parse(cleaned);
  if (cfg.NODE_ENV === "production") {
    if (cfg.OTP_PROVIDER !== "msg91") throw new Error("Production must use a real OTP provider");
    if (cfg.JWT_SECRET.startsWith("local-dev-only")) throw new Error("Set a real JWT_SECRET in production");
    if (cfg.DATABASE_URL.startsWith("pglite")) throw new Error("Production must use PostgreSQL, not the demo database");
  }
  // Local convenience: sign in as 99999 00000 to open /admin. Production must list real numbers.
  if (cfg.NODE_ENV === "development" && !cfg.ADMIN_PHONES) cfg.ADMIN_PHONES = DEV_ADMIN_PHONE;
  return cfg;
}

export const DEV_ADMIN_PHONE = "9999900000";
