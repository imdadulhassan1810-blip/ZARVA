import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for sensitive files at rest (partner KYC documents).
 * Output layout: iv (12 bytes) | auth tag (16 bytes) | ciphertext. Tampering makes decrypt throw.
 */
export class Vault {
  private key: Buffer;
  constructor(secret: string) {
    this.key = createHash("sha256").update(`zarva-vault:${secret}`).digest();
  }
  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([c.update(plain), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }
  decrypt(blob: Buffer): Buffer {
    const d = createDecipheriv("aes-256-gcm", this.key, blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
  }
}
