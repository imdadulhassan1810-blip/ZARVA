import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { signToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toPublicUser } from "../lib/serialize";
import { getGoogleClientConfig, googleAuthEnabled, verifyGoogleIdToken } from "../lib/google";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  phone: z.string().max(20).optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { name, email, password, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const message = existing.passwordHash
      ? "An account with this email already exists"
      : "This email already has a Google account — use \"Continue with Google\" to sign in instead";
    return res.status(409).json({ error: "email_taken", message });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, phone } });
  const token = signToken(user.id);
  res.status(201).json({ user: toPublicUser(user), token });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "Email and password are required" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
  }
  if (!user.passwordHash) {
    return res.status(401).json({
      error: "google_account",
      message: "This account signs in with Google — use \"Continue with Google\" instead.",
    });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
  }
  if (!user.isActive) {
    return res.status(403).json({ error: "account_disabled", message: "This account has been deactivated. Contact an admin." });
  }

  const token = signToken(user.id);
  res.json({ user: toPublicUser(user), token });
});

authRouter.get("/google/config", (_req, res) => {
  res.json({ enabled: googleAuthEnabled, ...(googleAuthEnabled ? getGoogleClientConfig() : {}) });
});

const googleSchema = z.object({ idToken: z.string().min(1) });

// Exchanges a verified Google ID token for a OneApp session. First sign-in with a given
// Google account creates the local user (no password); if a password account already
// exists with that email, this links the Google id onto it instead of erroring — the
// same person, two ways in.
authRouter.post("/google", async (req, res) => {
  if (!googleAuthEnabled) {
    return res.status(501).json({
      error: "google_not_configured",
      message: "Sign in with Google isn't configured on this server. Set GOOGLE_CLIENT_ID, or log in with a password instead.",
    });
  }

  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "idToken is required" });
  }

  const info = await verifyGoogleIdToken(parsed.data.idToken);
  if (!info) {
    return res.status(401).json({ error: "invalid_token", message: "Couldn't verify that Google sign-in — please try again." });
  }

  let user = await prisma.user.findUnique({ where: { googleId: info.googleId } });
  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: info.email } });
    user = existingByEmail
      ? await prisma.user.update({ where: { id: existingByEmail.id }, data: { googleId: info.googleId } })
      : await prisma.user.create({ data: { name: info.name, email: info.email, googleId: info.googleId } });
  }

  if (!user.isActive) {
    return res.status(403).json({ error: "account_disabled", message: "This account has been deactivated. Contact an admin." });
  }

  const token = signToken(user.id);
  res.json({ user: toPublicUser(user), token });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "not_found", message: "User not found" });
  if (!user.isActive) {
    return res.status(403).json({ error: "account_disabled", message: "This account has been deactivated. Contact an admin." });
  }
  res.json(toPublicUser(user));
});
