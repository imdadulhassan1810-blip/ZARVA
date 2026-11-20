import { createPaymentProvider } from "@zarva/payments";
import { ConsoleOtpSender, MemoryOtpSender, Msg91OtpSender, type OtpSender } from "./auth/otp-sender";
import { buildApp } from "./app";
import { connectDb } from "./db/connect";
import { loadConfig } from "./lib/config";

const config = loadConfig();
const { db, kind } = await connectDb(config.DATABASE_URL);

const otpSender: OtpSender =
  config.OTP_PROVIDER === "msg91"
    ? new Msg91OtpSender(process.env.MSG91_AUTH_KEY ?? "", process.env.MSG91_TEMPLATE_ID ?? "")
    : config.OTP_PROVIDER === "memory"
      ? new MemoryOtpSender()
      : new ConsoleOtpSender();

const app = await buildApp({ db, config, otpSender, paymentProvider: createPaymentProvider(process.env), logger: config.NODE_ENV === "production" });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
console.log(`\n  ZARVA API ready on http://localhost:${config.PORT}  (database: ${kind})`);
if (config.OTP_PROVIDER === "console") console.log("  Sign-in codes (OTP) will be printed here.\n");
