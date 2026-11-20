import { generateSecret, otpauthUrl } from "./totp";

/** `pnpm admin:2fa 9876543210` prints a new authenticator secret for that admin. */
const raw = (process.argv[2] ?? "").replace(/\D/g, "").slice(-10);
if (!/^[6-9]\d{9}$/.test(raw)) {
  console.error("Usage: pnpm admin:2fa <10-digit admin mobile number>");
  process.exit(1);
}
const secret = generateSecret();
console.log(`
1. Open Google Authenticator (or Microsoft Authenticator) on the admin's phone.
2. Tap +  ->  "Enter a setup key". Account: ZARVA admin ${raw}. Key: ${secret}  (time based)
   Or paste this link into a QR code generator you trust and scan it:
   ${otpauthUrl(secret, raw)}
3. Add this to the API settings (append with a comma if there are other admins):

   ADMIN_PHONES=${raw}
   ADMIN_TOTP_SECRETS=${raw}:${secret}

Treat the key like a password: anyone with it plus the admin's phone can open /admin.
`);
