import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toCartItem, toOrder } from "../lib/serialize";
import { ensureListingExists } from "../lib/listings";
import { sendPushNotification } from "../lib/push";
import { razorpay, razorpayEnabled, getRazorpayKeyId } from "../lib/razorpay";
import { finalizeTrackingSpec, resolveTrackingRoute } from "../lib/tracking";

export const cartRouter = Router();
cartRouter.use(requireAuth);

async function currentCart(userId: string) {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { listing: true },
    orderBy: { createdAt: "asc" },
  });
  return items.map(toCartItem);
}

cartRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await currentCart(req.userId!));
});

const addSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).default(1),
});

cartRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "listingId is required" });
  }
  const { listingId, quantity } = parsed.data;

  const listing = await ensureListingExists(listingId);
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });

  await prisma.cartItem.upsert({
    where: { userId_listingId: { userId: req.userId!, listingId: listing.id } },
    update: { quantity: { increment: quantity } },
    create: { userId: req.userId!, listingId: listing.id, quantity },
  });

  res.status(201).json(await currentCart(req.userId!));
});

const updateSchema = z.object({ quantity: z.number().int().min(1).max(50) });

cartRouter.patch("/:itemId", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "quantity must be a positive integer" });
  }

  const item = await prisma.cartItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Cart item not found" });
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity } });
  res.json(await currentCart(req.userId!));
});

cartRouter.delete("/:itemId", async (req: AuthedRequest, res) => {
  const item = await prisma.cartItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Cart item not found" });
  }
  await prisma.cartItem.delete({ where: { id: item.id } });
  res.json(await currentCart(req.userId!));
});

async function summarizeCart(userId: string) {
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { listing: true } });
  if (items.length === 0) return null;

  const foodItem = items.find((i) => i.listing.categorySlug === "food");

  return {
    total: items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0),
    categorySlug: items[0].listing.categorySlug,
    orderItems: items.map((i) => ({
      listingTitle: i.listing.title,
      categorySlug: i.listing.categorySlug,
      quantity: i.quantity,
      unitPrice: i.listing.price,
    })),
    // If any item is from Food Delivery, the order gets a simulated delivery-tracking journey
    // from that restaurant's location — first food item wins for a mixed cart.
    trackingRoute: foodItem ? resolveTrackingRoute("food", foodItem.listing.meta as Record<string, unknown>) : null,
  };
}

const checkoutSchema = z.object({ details: z.record(z.unknown()).optional() });

cartRouter.post("/checkout", async (req: AuthedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body ?? {});
  const details = parsed.success ? (parsed.data.details ?? {}) : {};

  const summary = await summarizeCart(req.userId!);
  if (!summary) return res.status(400).json({ error: "empty_cart", message: "Your cart is empty" });

  const detailsWithRoute = summary.trackingRoute ? { ...details, trackingRoute: summary.trackingRoute } : details;
  const tracking = finalizeTrackingSpec(summary.categorySlug, detailsWithRoute);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: req.userId!,
        type: "purchase",
        status: "confirmed",
        categorySlug: summary.categorySlug,
        total: summary.total,
        items: summary.orderItems as Prisma.InputJsonValue,
        details: { ...detailsWithRoute, ...(tracking ? { tracking } : {}) } as Prisma.InputJsonValue,
      },
    });
    await tx.cartItem.deleteMany({ where: { userId: req.userId! } });
    return created;
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  await sendPushNotification(user?.pushToken, {
    title: "Order confirmed 🎉",
    body: `Your ₹${summary.total.toLocaleString("en-IN")} order is on its way.`,
    data: { orderId: order.id },
  });

  res.status(201).json(toOrder(order));
});

cartRouter.post("/checkout/razorpay", async (req: AuthedRequest, res) => {
  if (!razorpayEnabled || !razorpay) {
    return res.status(501).json({
      error: "razorpay_not_configured",
      message: "Razorpay isn't configured on this server. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, or use the standard checkout instead.",
    });
  }

  const parsed = checkoutSchema.safeParse(req.body ?? {});
  const details = parsed.success ? (parsed.data.details ?? {}) : {};

  const summary = await summarizeCart(req.userId!);
  if (!summary) return res.status(400).json({ error: "empty_cart", message: "Your cart is empty" });

  const detailsWithRoute = summary.trackingRoute ? { ...details, trackingRoute: summary.trackingRoute } : details;

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "purchase",
      status: "pending_payment",
      categorySlug: summary.categorySlug,
      total: summary.total,
      items: summary.orderItems as Prisma.InputJsonValue,
      details: detailsWithRoute as Prisma.InputJsonValue,
    },
  });

  const rpOrder = await razorpay.orders.create({
    amount: Math.round(summary.total * 100),
    currency: "INR",
    receipt: order.id,
    notes: { oneappOrderId: order.id },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { details: { ...detailsWithRoute, razorpayOrderId: rpOrder.id } as Prisma.InputJsonValue },
  });

  res.status(201).json({
    order: toOrder(order),
    razorpayOrderId: rpOrder.id,
    amount: summary.total,
    currency: "INR",
    keyId: getRazorpayKeyId(),
  });
});
