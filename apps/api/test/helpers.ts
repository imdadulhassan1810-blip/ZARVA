import { phoneSchema } from "@zarva/core";
import { MockProvider } from "@zarva/payments";
import { buildApp } from "../src/app";
import { MemoryOtpSender } from "../src/auth/otp-sender";
import { createDb } from "../src/db/client";
import { loadConfig } from "../src/lib/config";

export async function setupTestApp(env: Record<string, string> = {}) {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://zarva:zarva@localhost:5432/zarva_test";
  const { db, sql } = createDb(url);
  await sql`truncate payment_events, payments, addresses, sessions, otp_challenges, users restart identity cascade`;
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: url, JWT_SECRET: "test-secret-test-secret-test-secret-123", ...env });
  const otp = new MemoryOtpSender();
  const provider = new MockProvider();
  const app = await buildApp({ db, config, otpSender: otp, paymentProvider: provider });
  return {
    app, db, sql, otp, provider,
    async close() {
      await app.close();
      await sql.end();
    },
    async login(phone = "9876543210") {
      await app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
      const code = otp.last.get(phoneSchema.parse(phone))!;
      const res = await app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone, code } });
      const body = res.json();
      return { ...body, headers: { authorization: `Bearer ${body.accessToken}` } } as {
        accessToken: string; refreshToken: string; user: { id: string }; isNewUser: boolean; headers: Record<string, string>;
      };
    },
  };
}
