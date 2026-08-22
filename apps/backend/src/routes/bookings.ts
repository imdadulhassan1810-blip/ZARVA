import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { BOOKING_CATEGORY_SLUGS } from "@oneapp/shared";
import { sendPushNotification } from "../lib/push";
import { razorpay, razorpayEnabled, getRazorpayKeyId } from "../lib/razorpay";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const bookingSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  details: z.record(z.unknown()).optional(),
});

async function resolveBookableListing(listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return { error: "not_found" as const };
  if (!BOOKING_CATEGORY_SLUGS.includes(listing.categorySlug)) return { error: "not_bookable" as const };
  return { listing };
}

// Direct "book now" flow for the travel-style categories (cab, hotel, flight, train, bus, gas) -
// these don't go through the cart, a single order is created immediately.
bookingsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "listingId is required" });
  }
  const { listingId, quantity, details } = parsed.data;

  const resolved = await resolveBookableListing(listingId);
  if (resolved.error === "not_found") return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (resolved.error === "not_bookable") {
    return res.status(400).json({ error: "not_bookable", message: "This category is bought via the cart, not booked directly" });
  }
  const { listing } = resolved;

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "booking",
      status: "confirmed",
      categorySlug: listing.categorySlug,
      total: listing.price * quantity,
      items: [
        {
          listingTitle: listing.title,
          categorySlug: listing.categorySlug,
          quantity,
          unitPrice: listing.price,
          meta: details ?? {},
        },
      ] as Prisma.InputJsonValue,
      details: (details ?? {}) as Prisma.InputJsonValue,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  await sendPushNotification(user?.pushToken, {
    title: "Booking confirmed ✅",
    body: `${listing.title} is booked — ₹${order.total.toLocaleString("en-IN")}.`,
    data: { orderId: order.id },
  });

  res.status(201).json(toOrder(order));
});

bookingsRouter.post("/razorpay", async (req: AuthedRequest, res) => {
  if (!razorpayEnabled || !razorpay) {
    return res.status(501).json({
      error: "razorpay_not_configured",
      message: "Razorpay isn't configured on this server. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, or use the standard booking instead.",
    });
  }

  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "listingId is required" });
  }
  const { listingId, quantity, details } = parsed.data;

  const resolved = await resolveBookableListing(listingId);
  if (resolved.error === "not_found") return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (resolved.error === "not_bookable") {
    return res.status(400).json({ error: "not_bookable", message: "This category is bought via the cart, not booked directly" });
  }
  const { listing } = resolved;
  const total = listing.price * quantity;

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "booking",
      status: "pending_payment",
      categorySlug: listing.categorySlug,
      total,
      items: [
        {
          listingTitle: listing.title,
          categorySlug: listing.categorySlug,
          quantity,
          unitPrice: listing.price,
          meta: details ?? {},
        },
      ] as Prisma.InputJsonValue,
      details: (details ?? {}) as Prisma.InputJsonValue,
    },
  });

  const rpOrder = await razorpay.orders.create({
    amount: Math.round(total * 100),
    currency: "INR",
    receipt: order.id,
    notes: { oneappOrderId: order.id },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { details: { ...(details ?? {}), razorpayOrderId: rpOrder.id } as Prisma.InputJsonValue },
  });

  res.status(201).json({
    order: toOrder(order),
    razorpayOrderId: rpOrder.id,
    amount: total,
    currency: "INR",
    keyId: getRazorpayKeyId(),
  });
});
