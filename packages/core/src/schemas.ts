import { z } from "zod";

/**
 * Indian mobile numbers. Accepts "9876543210", "+91 98765 43210", "09876543210".
 * Normalises to E.164 (+919876543210). Indian mobiles start with 6-9.
 */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-()]/g, ""))
  .transform((s) => s.replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, ""))
  .refine((s) => /^[6-9]\d{9}$/.test(s), "Enter a valid 10-digit Indian mobile number")
  .transform((s) => `+91${s}`);

export const otpSchema = z.string().regex(/^\d{6}$/, "OTP must be 6 digits");

export const requestOtpSchema = z.object({ phone: phoneSchema });
/** Which app the sign-in opens. "partner" sessions can't use customer screens, and the reverse. */
export const userPortalSchema = z.enum(["customer", "partner"]);
export type UserPortal = z.infer<typeof userPortalSchema>;
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpSchema, deviceName: z.string().max(80).optional(), portal: userPortalSchema.default("customer") });
/** ZARVA-issued admin usernames: lower-case letters, digits, dot, dash, underscore. */
export const adminUsernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username: 3-32 letters, digits, . _ or -");
export const adminPasswordSchema = z.string().min(10, "Password must be at least 10 characters").max(200);
export const adminLoginSchema = z.object({
  username: adminUsernameSchema,
  password: z.string().min(1).max(200),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
});
export const adminCreateSchema = z.object({ username: adminUsernameSchema, name: z.string().trim().min(2).max(80) });
export const adminPasswordChangeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: adminPasswordSchema });
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(120);
export const requestEmailCodeSchema = z.object({ email: emailSchema });
export const verifyEmailCodeSchema = z.object({ email: emailSchema, code: otpSchema, deviceName: z.string().max(80).optional() });
export const googleLoginSchema = z.object({ idToken: z.string().min(10).max(4096), deviceName: z.string().max(80).optional() });
export const appleLoginSchema = z.object({
  identityToken: z.string().min(10).max(4096),
  name: z.string().trim().max(80).optional(),
  deviceName: z.string().max(80).optional(),
});
/** Adding a phone or email to a signed-in account. */
export const linkPhoneRequestSchema = z.object({ phone: phoneSchema });
export const linkPhoneVerifySchema = z.object({ phone: phoneSchema, code: otpSchema });
export const linkEmailRequestSchema = z.object({ email: emailSchema });
export const linkEmailVerifySchema = z.object({ email: emailSchema, code: otpSchema });

export const refreshSchema = z.object({ refreshToken: z.string().min(20) });

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    // Email is not editable here: it is set only by verifying it (code or Google).
    preferredLanguage: z.enum(["en", "hi", "bn"]),
    /** Booking updates on WhatsApp as well as SMS. WhatsApp rules need the person's opt-in. */
    whatsappOptIn: z.boolean(),
  })
  .partial();

export const pincodeSchema = z.string().regex(/^[1-9]\d{5}$/, "PIN code must be 6 digits");

export const addressInputSchema = z.object({
  label: z.enum(["home", "work", "other"]).default("home"),
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: pincodeSchema,
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().default(false),
});
export const addressUpdateSchema = addressInputSchema.partial();

export type AddressInput = z.infer<typeof addressInputSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** "+919876543210" -> "+91 98765 43210" for display. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
