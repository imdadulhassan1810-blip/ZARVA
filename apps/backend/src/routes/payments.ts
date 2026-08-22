import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { getRazorpayKeyId, razorpayEnabled, verifyRazorpaySignature } from "../lib/razorpay";
import { sendPushNotification } from "../lib/push";

export const paymentsRouter = Router();

paymentsRouter.get("/razorpay/config", (_req, res) => {
  res.json({ enabled: razorpayEnabled, keyId: razorpayEnabled ? getRazorpayKeyId() : undefined });
});

const verifySchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const FINAL_STATUS_BY_TYPE: Record<string, string> = {
  booking: "confirmed",
  purchase: "confirmed",
  bill_payment: "completed",
};

paymentsRouter.post("/razorpay/verify", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "Missing Razorpay verification fields" });
  }
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Order not found" });
  }
  if (order.status !== "pending_payment") {
    // Already verified (or never went through Razorpay) — return it as-is, idempotently.
    return res.json(toOrder(order));
  }

  const details = (order.details as Record<string, unknown>) ?? {};
  if (details.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ error: "order_mismatch", message: "This payment doesn't match the pending order" });
  }

  const valid = verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
  if (!valid) {
    return res.status(400).json({ error: "invalid_signature", message: "Payment verification failed" });
  }

  const finalStatus = FINAL_STATUS_BY_TYPE[order.type] ?? "confirmed";
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: order.id },
      data: {
        status: finalStatus,
        details: { ...details, razorpayPaymentId: razorpay_payment_id },
      },
    });
    if (order.type === "purchase") {
      await tx.cartItem.deleteMany({ where: { userId: req.userId! } });
    }
    return result;
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  await sendPushNotification(user?.pushToken, {
    title: "Payment successful ✅",
    body: `₹${updated.total.toLocaleString("en-IN")} paid via Razorpay.`,
    data: { orderId: updated.id },
  });

  res.json(toOrder(updated));
});
