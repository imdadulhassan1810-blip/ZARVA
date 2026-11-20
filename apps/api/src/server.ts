import { createPaymentProvider } from "@zarva/payments";
import { ConsoleOtpSender, MemoryOtpSender, Msg91OtpSender, type OtpSender } from "./auth/otp-sender";
import { buildApp } from "./app";
import { createDb } from "./db/client";
import { loadConfig } from "./lib/config";

const config = loadConfig();
const { db } = createDb(config.DATABASE_URL);

const otpSender: OtpSender =
  config.OTP_PROVIDER === "msg91"
    ? new Msg91OtpSender(process.env.MSG91_AUTH_KEY ?? "", process.env.MSG91_TEMPLATE_ID ?? "")
    : config.OTP_PROVIDER === "memory"
      ? new MemoryOtpSender()
      : new ConsoleOtpSender();

const app = await buildApp({ db, config, otpSender, paymentProvider: createPaymentProvider(process.env), logger: true });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
