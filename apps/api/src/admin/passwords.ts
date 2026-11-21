import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** Stored as "scrypt:<salt base64>:<hash base64>". Slow on purpose, so a leaked table can't be guessed quickly. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, PARAMS);
  return ["scrypt", salt.toString("base64"), hash.toString("base64")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split(":");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, PARAMS);
  return timingSafeEqual(actual, expected);
}

/** A starting password the new admin types once and then changes: 16 characters, no look-alikes. */
export function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(16), (b) => chars[b % chars.length]).join("");
}

/** Checked when the username doesn't exist, so a wrong username takes as long as a wrong password. */
export const DUMMY_HASH = ["scrypt", Buffer.alloc(16).toString("base64"), Buffer.alloc(32).toString("base64")].join(":");
