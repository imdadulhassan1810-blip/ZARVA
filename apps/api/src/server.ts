import { createPaymentProvider } from "@zarva/payments";
import { ConsoleOtpSender, MemoryOtpSender, Msg91OtpSender, type OtpSender } from "./auth/otp-sender";
import { buildApp } from "./app";
import { connectDb } from "./db/connect";
import { DEV_ADMIN_PHONE, loadConfig } from "./lib/config";
import { ensureHomeSeed } from "./modules/home/seed";

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

const app = await buildApp({ db, config, otpSender, paymentProvider: createPaymentProvider(process.env), logger: config.NODE_ENV === "production" });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
console.log(`\n  ZARVA API ready on http://localhost:${config.PORT}  (database: ${kind})`);
if (homeSeed.seeded) console.log(`  Home services: Durgapur catalogue loaded${kind === "pglite" && config.devShortcuts ? ", demo professionals 90000 00001 to 90000 00008" : ""}.`);
if (homeOn && config.devShortcuts && config.ADMIN_PHONES === DEV_ADMIN_PHONE) console.log("  Admin screens: sign in as 99999 00000 and open http://localhost:3000/admin");
if (config.OTP_PROVIDER === "console") console.log("  Sign-in codes (OTP) will be printed here.\n");
