import { Router } from "express";
import { Prisma } from "@prisma/client";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { refundRazorpayPayment } from "../lib/razorpay";
import { computeTrackingState, type TrackingSpec } from "../lib/tracking";
import { sendPushNotification } from "../lib/push";

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

const ONLINE_PAID_METHODS = new Set(["card", "netbanking", "razorpay"]);

/**
 * Lets a user cancel their own order/booking — mirrors real platforms: blocked once an
 * order is already completed or cancelled, and blocked once a trackable trip (cab/food/
 * home-service) has actually started, since there's a real driver/partner "en route" by
 * then. Automatically refunds via Razorpay when the order was actually paid for online.
 */
ordersRouter.post("/:id/cancel", async (req: AuthedRequest, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Order not found" });
  }

  if (order.status === "cancelled") {
    return res.status(400).json({ error: "already_cancelled", message: "This order is already cancelled" });
  }
  if (order.status === "completed") {
    return res.status(400).json({ error: "already_completed", message: "This order is already completed and can't be cancelled" });
  }

  const details = (order.details as Record<string, unknown>) ?? {};
  const tracking = details.tracking as TrackingSpec | undefined;
  if (tracking) {
    const state = computeTrackingState(order.id, tracking);
    if (state.status === "in_progress" || state.status === "completed") {
      return res.status(400).json({
        error: "trip_in_progress",
        message:
          state.status === "completed"
            ? "This trip has already finished and can't be cancelled"
            : "Your trip is already in progress and can't be cancelled",
      });
    }
  }

  let refunded = false;
  const razorpayPaymentId = details.razorpayPaymentId as string | undefined;
  if (razorpayPaymentId && ONLINE_PAID_METHODS.has(order.paymentMethod)) {
    const refund = await refundRazorpayPayment(razorpayPaymentId);
    refunded = Boolean(refund);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "cancelled",
      details: {
        ...details,
        cancelledAt: new Date().toISOString(),
        ...(razorpayPaymentId ? { refunded } : {}),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  await sendPushNotification(user?.pushToken, {
    title: "Order cancelled",
    body: refunded
      ? `Your ₹${updated.total.toLocaleString("en-IN")} order was cancelled and refunded.`
      : `Your ₹${updated.total.toLocaleString("en-IN")} order was cancelled.`,
    data: { orderId: updated.id },
  });

  res.json(toOrder(updated));
});
