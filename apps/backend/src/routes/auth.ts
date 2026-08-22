import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { signToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toPublicUser } from "../lib/serialize";

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
    return res.status(409).json({ error: "email_taken", message: "An account with this email already exists" });
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
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
  }

  const token = signToken(user.id);
  res.json({ user: toPublicUser(user), token });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "not_found", message: "User not found" });
  res.json(toPublicUser(user));
});
