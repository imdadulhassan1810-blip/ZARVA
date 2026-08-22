import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { BILLER_TYPES } from "@oneapp/shared";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { sendPushNotification } from "../lib/push";
import { razorpay, razorpayEnabled, getRazorpayKeyId } from "../lib/razorpay";

export const billsRouter = Router();
billsRouter.use(requireAuth);

// Deterministic mock "biller" - in a real system this would call each utility's API.
// The consumer number is hashed into a stable due amount and due date so repeat
// lookups of the same number are consistent within a demo session.
function mockBillFor(billerType: string, consumerNumber: string) {
  const biller = BILLER_TYPES.find((b) => b.slug === billerType);
  if (!biller) return null;

  let hash = 0;
  for (const ch of consumerNumber) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  const baseByType: Record<string, number> = {
    electricity: 450,
    water: 180,
    mobile: 299,
    dth: 350,
    broadband: 799,
    "credit-card": 2500,
  };
  const base = baseByType[billerType] ?? 200;
  const amountDue = Math.round((base + (hash % 500)) * 100) / 100;
  const dueInDays = 3 + (hash % 12);
  const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `${billerType}-${consumerNumber}`,
    billerType,
    billerName: biller.name,
    consumerNumber,
    amountDue,
    dueDate,
  };
}

billsRouter.get("/billers", (_req, res) => {
  res.json(BILLER_TYPES);
});

billsRouter.get("/lookup", (req, res) => {
  const billerType = String(req.query.billerType ?? "");
  const consumerNumber = String(req.query.consumerNumber ?? "");
  if (!billerType || !consumerNumber) {
    return res.status(400).json({ error: "invalid_input", message: "billerType and consumerNumber are required" });
  }
  const bill = mockBillFor(billerType, consumerNumber);
  if (!bill) return res.status(404).json({ error: "unknown_biller", message: "Unknown biller type" });
  res.json(bill);
});

const paySchema = z.object({
  billerType: z.string().min(1),
  billerName: z.string().min(1),
  consumerNumber: z.string().min(1),
  amount: z.number().positive(),
});

billsRouter.post("/pay", async (req: AuthedRequest, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "billerType, billerName, consumerNumber and amount are required" });
  }
  const { billerType, billerName, consumerNumber, amount } = parsed.data;

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "bill_payment",
      status: "completed",
      categorySlug: "bills",
      total: amount,
      items: [
        {
          listingTitle: `${billerName} bill (${consumerNumber})`,
          categorySlug: "bills",
          quantity: 1,
          unitPrice: amount,
        },
      ],
      details: { billerType, billerName, consumerNumber },
    },
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  await sendPushNotification(user?.pushToken, {
    title: "Bill paid 🧾",
    body: `${billerName} bill of ₹${amount.toLocaleString("en-IN")} paid successfully.`,
    data: { orderId: order.id },
  });

  res.status(201).json(toOrder(order));
});

billsRouter.post("/pay/razorpay", async (req: AuthedRequest, res) => {
  if (!razorpayEnabled || !razorpay) {
    return res.status(501).json({
      error: "razorpay_not_configured",
      message: "Razorpay isn't configured on this server. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, or use the standard payment instead.",
    });
  }

  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "billerType, billerName, consumerNumber and amount are required" });
  }
  const { billerType, billerName, consumerNumber, amount } = parsed.data;

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "bill_payment",
      status: "pending_payment",
      categorySlug: "bills",
      total: amount,
      items: [
        {
          listingTitle: `${billerName} bill (${consumerNumber})`,
          categorySlug: "bills",
          quantity: 1,
          unitPrice: amount,
        },
      ] as Prisma.InputJsonValue,
      details: { billerType, billerName, consumerNumber } as Prisma.InputJsonValue,
    },
  });

  const rpOrder = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: order.id,
    notes: { oneappOrderId: order.id },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { details: { billerType, billerName, consumerNumber, razorpayOrderId: rpOrder.id } as Prisma.InputJsonValue },
  });

  res.status(201).json({
    order: toOrder(order),
    razorpayOrderId: rpOrder.id,
    amount,
    currency: "INR",
    keyId: getRazorpayKeyId(),
  });
});
