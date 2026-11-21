import { adminCreateSchema } from "@zarva/core";
import { connectDb } from "../db/connect";
import { loadConfig } from "../lib/config";
import { Vault } from "../lib/vault";
import { AdminAccountService } from "./accounts";

/**
 * Creates a ZARVA admin login. Use it once for the first admin (on Render: zarva-api -> Shell);
 * after that, admins add each other in the admin app's Team tab.
 *
 *   pnpm admin:create imdad "Imdadul Hassan"
 */
const parsed = adminCreateSchema.safeParse({ username: process.argv[2] ?? "", name: process.argv.slice(3).join(" ") });
if (!parsed.success) {
  console.error('Usage: pnpm admin:create <username> "<Full name>"\n' + parsed.error.issues.map((i) => `  ${i.message}`).join("\n"));
  process.exit(1);
}
const config = loadConfig();
const { db, close } = await connectDb(config.DATABASE_URL);
const vault = new Vault(config.KYC_ENCRYPTION_KEY ?? `dev:${config.JWT_SECRET}`);
const admins = new AdminAccountService(db, vault, config.JWT_SECRET, config.devShortcuts);
try {
  const r = await admins.create(null, parsed.data);
  console.log(`
Admin login created for ${r.admin.name}. Give these to them privately; they are shown only now.

  Username:        ${r.admin.username}
  Start password:  ${r.password}   (change it after the first sign-in: admin app -> Team -> Change my password)

  Authenticator:   open Google Authenticator or Microsoft Authenticator -> + -> "Enter a setup key"
                   Account: ZARVA admin ${r.admin.username}   Key: ${r.authenticatorKey}   (time based)
                   Or turn this link into a QR code with a generator you trust: ${r.authenticatorLink}

Sign in at <your website>/admin/login with the username, the password and the 6-digit code.
`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await close();
}
