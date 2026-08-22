import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get("/", async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders.map(toOrder));
});

ordersRouter.get("/:id", async (req: AuthedRequest, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Order not found" });
  }
  res.json(toOrder(order));
});
