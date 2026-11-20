import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  OTP_PROVIDER: z.enum(["console", "msg91", "memory"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  ENABLED_MODULES: z.string().default(""),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
});
export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cfg = envSchema.parse(env);
  if (cfg.NODE_ENV === "production" && cfg.OTP_PROVIDER !== "msg91") {
    throw new Error("Production must use a real OTP provider");
  }
  return cfg;
}
