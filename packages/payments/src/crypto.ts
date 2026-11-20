import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
