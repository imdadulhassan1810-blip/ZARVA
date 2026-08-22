import crypto from "node:crypto";
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export const razorpayEnabled = Boolean(keyId && keySecret);

export const razorpay = razorpayEnabled ? new Razorpay({ key_id: keyId!, key_secret: keySecret! }) : null;

export function getRazorpayKeyId() {
  return keyId;
}

/**
 * Verifies the HMAC-SHA256 signature Razorpay returns after a successful checkout,
 * per https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/verify-signature/.
 * Never trust a "payment succeeded" claim from the client without this check.
 */
export function verifyRazorpaySignature(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(input.razorpay_signature ?? "");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
