import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAdmin, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toAdminOrder, toAdminUser } from "../lib/serialize";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// --- Users ---

adminRouter.get("/users", async (_req, res) => {
  const [users, orderAggregates] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.order.groupBy({ by: ["userId"], _count: { _all: true }, _sum: { total: true } }),
  ]);

  const byUserId = new Map(orderAggregates.map((a) => [a.userId, a]));
  res.json(
    users.map((u) => {
      const agg = byUserId.get(u.id);
      return toAdminUser(u, agg?._count._all ?? 0, agg?._sum.total ?? 0);
    }),
  );
});

const setActiveSchema = z.object({ isActive: z.boolean() });

adminRouter.patch("/users/:id", async (req: AuthedRequest, res) => {
  const parsed = setActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "isActive (boolean) is required" });
  }
  if (req.params.id === req.userId && !parsed.data.isActive) {
    return res.status(400).json({ error: "cannot_deactivate_self", message: "You can't deactivate your own admin account" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "not_found", message: "User not found" });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: parsed.data.isActive } });
  const [orderCount, orderSum] = await Promise.all([
    prisma.order.count({ where: { userId: user.id } }),
    prisma.order.aggregate({ where: { userId: user.id }, _sum: { total: true } }),
  ]);
  res.json(toAdminUser(updated, orderCount, orderSum._sum.total ?? 0));
});

// --- Orders ---

adminRouter.get("/orders", async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json(orders.map(toAdminOrder));
});

const setStatusSchema = z.object({
  status: z.enum(["pending_payment", "confirmed", "completed", "cancelled"]),
});

adminRouter.patch("/orders/:id", async (req, res) => {
  const parsed = setStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "A valid status is required" });
  }

  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: parsed.data.status },
    include: { user: true },
  });
  res.json(toAdminOrder(updated));
});

// --- Stats ---

adminRouter.get("/stats", async (_req, res) => {
  const [totalUsers, activeUsers, totalOrders, revenueAgg, byCategory, byStatus] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.order.count(),
    prisma.order.aggregate({ _sum: { total: true }, where: { status: { in: ["confirmed", "completed"] } } }),
    prisma.order.groupBy({ by: ["categorySlug"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    totalOrders,
    totalRevenue: revenueAgg._sum.total ?? 0,
    ordersByCategory: Object.fromEntries(byCategory.map((c) => [c.categorySlug, c._count._all])),
    ordersByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  });
});
