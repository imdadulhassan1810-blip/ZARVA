import { phoneSchema } from "@zarva/core";
import { MockPayoutProvider, MockProvider, type PayoutProvider } from "@zarva/payments";
import { MemoryChannel } from "../src/notify";
import { buildApp } from "../src/app";
import { MemoryOtpSender } from "../src/auth/otp-sender";
import { MemoryEmailSender } from "../src/auth/email-sender";
import { createDb } from "../src/db/client";
import { loadConfig } from "../src/lib/config";
import { seedHomeCatalog } from "../src/modules/home/seed";

export async function setupTestApp(env: Record<string, string> = {}, opts: { now?: () => Date; payoutProvider?: PayoutProvider } = {}) {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://zarva:zarva@localhost:5432/zarva_test";
  const { db, sql } = createDb(url);
  await sql`truncate notifications, home_payout_events, home_pro_ledger, home_payouts, home_pro_documents, admin_unlocks, home_booking_events, home_booking_items, home_bookings, home_pros, payment_events, payments, addresses, sessions, otp_challenges, users restart identity cascade`;
  await seedHomeCatalog(db);
  await sql`update home_categories set commission_bps = 2000`;
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: url, JWT_SECRET: "test-secret-test-secret-test-secret-123", ...env });
  const otp = new MemoryOtpSender();
  const provider = new MockProvider();
  const mail = new MemoryEmailSender();
  const sms = new MemoryChannel("sms");
  const whatsapp = new MemoryChannel("whatsapp");
  const payouts = new MockPayoutProvider();
  const app = await buildApp({
    db, config, otpSender: otp, emailSender: mail, paymentProvider: provider, now: opts.now,
    notifyChannels: { sms, whatsapp }, payoutProvider: opts.payoutProvider ?? payouts,
  });
  return {
    app, db, sql, otp, mail, provider, sms, whatsapp, payouts,
    /** Send queued SMS/WhatsApp now and return what went out since the last call. */
    async messages() {
      await app.services.notify.flush();
      const out = [...sms.sent.map((m) => ({ ...m, channel: "sms" as const })), ...whatsapp.sent.map((m) => ({ ...m, channel: "whatsapp" as const }))];
      sms.sent = [];
      whatsapp.sent = [];
      return out;
    },
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

/** A tiny valid JPEG header + padding, enough to pass the file-type check. */
export const FAKE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");

/** Fills in everything a partner needs before admin review, then submits. */
export async function completeKyc(app: Awaited<ReturnType<typeof setupTestApp>>["app"], headers: Record<string, string>) {
  const P = "/v1/m/home";
  await app.inject({ method: "PATCH", url: `${P}/pro/me`, headers, payload: { idType: "pan", experienceYears: 4 } });
  for (const kind of ["id_front", "selfie"]) {
    const r = await app.inject({ method: "PUT", url: `${P}/pro/me/documents/${kind}`, headers, payload: { mime: "image/jpeg", dataBase64: FAKE_JPEG } });
    if (r.statusCode !== 200) throw new Error(`upload ${kind}: ${r.body}`);
  }
  await app.inject({ method: "PUT", url: `${P}/pro/me/payout`, headers, payload: { accountName: "Subrata Mondal", upi: "subrata@okaxis" } });
  const s = await app.inject({ method: "POST", url: `${P}/pro/me/submit`, headers });
  if (s.statusCode !== 200) throw new Error(`submit: ${s.body}`);
  return s.json().pro;
}
