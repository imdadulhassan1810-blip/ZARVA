import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const registerSchema = z.object({ token: z.string().min(1) });

notificationsRouter.post("/register-token", async (req: AuthedRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "token is required" });
  }

  await prisma.user.update({ where: { id: req.userId! }, data: { pushToken: parsed.data.token } });
  res.json({ ok: true });
});
