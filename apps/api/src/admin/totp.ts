import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 time-based codes, the same as Google Authenticator / Microsoft Authenticator. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const n = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

export const stepOf = (d: Date) => Math.floor(d.getTime() / 1000 / TOTP_STEP_SECONDS);

/** Returns the matching time step (allowing one step of clock drift either way), or null. */
export function verifyTotp(secret: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const s = stepOf(now);
  for (const step of [s, s - 1, s + 1]) {
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string): string {
  return `otpauth://totp/ZARVA%20Admin:${encodeURIComponent(account)}?secret=${secret}&issuer=ZARVA&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}
