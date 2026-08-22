import { Router } from "express";
import { Prisma, Listing as PrismaListing } from "@prisma/client";
import { z } from "zod";
import type { GeoPoint } from "@oneapp/shared";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { BOOKING_CATEGORY_SLUGS } from "@oneapp/shared";
import { sendPushNotification } from "../lib/push";
import { razorpay, razorpayEnabled, getRazorpayKeyId } from "../lib/razorpay";
import { computeCabFare } from "../lib/pricing";
import { finalizeTrackingSpec, resolveTrackingRoute } from "../lib/tracking";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const geoPointSchema = z.object({ lat: z.number(), lng: z.number(), address: z.string().optional() });

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

/** Real fare for cabs (never trust the client for this); flat listing price × quantity for everything else. */
function priceBooking(listing: PrismaListing, quantity: number, details: Record<string, unknown> | undefined) {
  if (listing.categorySlug === "cab") {
    const pickupParsed = geoPointSchema.safeParse(details?.pickup);
    const dropParsed = geoPointSchema.safeParse(details?.drop);
    if (!pickupParsed.success || !dropParsed.success) {
      return { error: "missing_location" as const, message: "Pickup and drop locations are required to book a cab" };
    }
    const meta = (listing.meta as Record<string, unknown>) ?? {};
    const quote = computeCabFare(
      {
        baseFare: listing.price,
        perKmRate: typeof meta.perKmRate === "number" ? meta.perKmRate : 12,
        perMinRate: typeof meta.perMinRate === "number" ? meta.perMinRate : 1.5,
        avgSpeedKmh: typeof meta.avgSpeedKmh === "number" ? meta.avgSpeedKmh : 28,
      },
      pickupParsed.data as GeoPoint,
      dropParsed.data as GeoPoint,
    );
    return { total: quote.total, unitPrice: quote.total, quantity: 1, itemMeta: { ...details, fareQuote: quote } };
  }
  return { total: listing.price * quantity, unitPrice: listing.price, quantity, itemMeta: details ?? {} };
}

/** Merges tracking info into an order's details: the fixed route for food/home-services is resolved once at creation; the time-anchored spec is added by the caller once the order is actually confirmed. */
function withTrackingRoute(listing: PrismaListing, details: Record<string, unknown> | undefined) {
  const base = { ...(details ?? {}) };
  if (listing.categorySlug === "cab") {
    // The actual vehicle type booked (e.g. "OneApp SUV"), not a generic "Cab" label.
    return { ...base, vehicleLabel: listing.title };
  }
  const route = resolveTrackingRoute(listing.categorySlug, listing.meta as Record<string, unknown>);
  return route ? { ...base, trackingRoute: route } : base;
}

// Direct "book now" flow for the travel-style categories (cab, hotel, flight, train, bus, gas,
// movies, home services) - these don't go through the cart, a single order is created immediately.
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

  const priced = priceBooking(listing, quantity, details);
  if ("error" in priced) return res.status(400).json({ error: priced.error, message: priced.message });

  const detailsWithRoute = withTrackingRoute(listing, details);
  const tracking = finalizeTrackingSpec(listing.categorySlug, detailsWithRoute);

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "booking",
      status: "confirmed",
      categorySlug: listing.categorySlug,
      total: priced.total,
      items: [
        {
          listingTitle: listing.title,
          categorySlug: listing.categorySlug,
          quantity: priced.quantity,
          unitPrice: priced.unitPrice,
          meta: priced.itemMeta,
        },
      ] as Prisma.InputJsonValue,
      details: { ...detailsWithRoute, ...(tracking ? { tracking } : {}) } as Prisma.InputJsonValue,
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

  const priced = priceBooking(listing, quantity, details);
  if ("error" in priced) return res.status(400).json({ error: priced.error, message: priced.message });

  // Tracking's clock doesn't start yet (payment isn't confirmed) — only the fixed route, if any.
  const detailsWithRoute = withTrackingRoute(listing, details);

  const order = await prisma.order.create({
    data: {
      userId: req.userId!,
      type: "booking",
      status: "pending_payment",
      categorySlug: listing.categorySlug,
      total: priced.total,
      items: [
        {
          listingTitle: listing.title,
          categorySlug: listing.categorySlug,
          quantity: priced.quantity,
          unitPrice: priced.unitPrice,
          meta: priced.itemMeta,
        },
      ] as Prisma.InputJsonValue,
      details: detailsWithRoute as Prisma.InputJsonValue,
    },
  });

  const rpOrder = await razorpay.orders.create({
    amount: Math.round(priced.total * 100),
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
    amount: priced.total,
    currency: "INR",
    keyId: getRazorpayKeyId(),
  });
});
