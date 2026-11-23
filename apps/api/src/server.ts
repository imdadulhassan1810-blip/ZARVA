import { createPaymentProvider, createPayoutProvider } from "@zarva/payments";
import { ConsoleOtpSender, MemoryOtpSender, Msg91OtpSender, type OtpSender } from "./auth/otp-sender";
import { ConsoleEmailSender, MemoryEmailSender, ResendEmailSender, type EmailSender } from "./auth/email-sender";
import { buildApp } from "./app";
import { connectDb } from "./db/connect";
import { DEV_ADMIN, loadConfig } from "./lib/config";
import { ensureHomeSeed } from "./modules/home/seed";
import { homeAutoAssigners } from "./modules/home/auto-assign";

const config = loadConfig();
const { db, kind } = await connectDb(config.DATABASE_URL);
const homeOn = config.ENABLED_MODULES.split(",").map((s) => s.trim()).includes("home");
// Demo professionals only ever go into the built-in demo database, never a real Postgres.
const homeSeed = homeOn ? await ensureHomeSeed(db, { demoPros: kind === "pglite" && config.devShortcuts }) : { seeded: false };

const otpSender: OtpSender =
  config.OTP_PROVIDER === "msg91"
    ? new Msg91OtpSender(process.env.MSG91_AUTH_KEY ?? "", process.env.MSG91_TEMPLATE_ID ?? "")
    : config.OTP_PROVIDER === "memory"
      ? new MemoryOtpSender()
      : new ConsoleOtpSender();

// Without this, EMAIL_PROVIDER=resend would still print codes to the log instead of emailing them.
const emailSender: EmailSender =
  config.EMAIL_PROVIDER === "resend"
    ? new ResendEmailSender(config.RESEND_API_KEY ?? "", config.EMAIL_FROM ?? "")
    : config.EMAIL_PROVIDER === "memory"
      ? new MemoryEmailSender()
      : new ConsoleEmailSender();

const app = await buildApp({
  db, config, otpSender, emailSender, paymentProvider: createPaymentProvider(process.env), payoutProvider: createPayoutProvider(process.env),
  logger: config.NODE_ENV === "production",
});
await app.listen({ port: config.PORT, host: "0.0.0.0" });
// Local demo admin (developer's machine only): username "admin", no authenticator needed locally.
let devAdmin = false;
if (config.devShortcuts && config.NODE_ENV === "development" && (await app.services.admins.count()) === 0) {
  await app.services.admins.create(null, DEV_ADMIN, { password: DEV_ADMIN.password, withAuthenticator: false });
  devAdmin = true;
}
// Sends queued SMS / WhatsApp updates every few seconds, and right after each change.
app.services.notify.start();
// Gives paid home-service bookings to free professionals, and refunds ones nobody can do.
homeAutoAssigners.get(app)?.start();
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => void app.close().then(() => process.exit(0)));
}
console.log(`\n  ZARVA API ready on http://localhost:${config.PORT}  (database: ${kind})`);
if (homeSeed.seeded) console.log(`  Home services: Durgapur catalogue loaded${kind === "pglite" && config.devShortcuts ? ", demo professionals 90000 00001 to 90000 00008" : ""}.`);
if (devAdmin || (config.devShortcuts && config.NODE_ENV === "development")) {
  console.log(`  Admin app: http://localhost:3000/admin/login  (demo login: ${DEV_ADMIN.username} / ${DEV_ADMIN.password})`);
} else if ((await app.services.admins.count()) === 0) {
  console.log('  No admin logins yet. Create the first one with: pnpm admin:create <username> "<Full name>"');
}
if (config.OTP_PROVIDER === "console") console.log("  Sign-in codes (OTP) will be printed here.");
if (config.SMS_PROVIDER === "console" || config.WHATSAPP_PROVIDER === "console") console.log("  Booking SMS / WhatsApp updates will be printed here too (nothing is really sent).\n");
