import { phoneSchema } from "@zarva/core";
import { MockProvider } from "@zarva/payments";
import { buildApp } from "../src/app";
import { MemoryOtpSender } from "../src/auth/otp-sender";
import { MemoryEmailSender } from "../src/auth/email-sender";
import { createDb } from "../src/db/client";
import { loadConfig } from "../src/lib/config";
import { seedHomeCatalog } from "../src/modules/home/seed";

export async function setupTestApp(env: Record<string, string> = {}, opts: { now?: () => Date } = {}) {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://zarva:zarva@localhost:5432/zarva_test";
  const { db, sql } = createDb(url);
  await sql`truncate admin_unlocks, home_booking_events, home_booking_items, home_bookings, home_pros, payment_events, payments, addresses, sessions, otp_challenges, users restart identity cascade`;
  await seedHomeCatalog(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: url, JWT_SECRET: "test-secret-test-secret-test-secret-123", ...env });
  const otp = new MemoryOtpSender();
  const provider = new MockProvider();
  const mail = new MemoryEmailSender();
  const app = await buildApp({ db, config, otpSender: otp, emailSender: mail, paymentProvider: provider, now: opts.now });
  return {
    app, db, sql, otp, mail, provider,
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
