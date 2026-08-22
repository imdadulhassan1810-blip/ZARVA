import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toOrder } from "../lib/serialize";
import { BOOKING_CATEGORY_SLUGS } from "@oneapp/shared";

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const bookingSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  details: z.record(z.unknown()).optional(),
});

// Direct "book now" flow for the travel-style categories (cab, hotel, flight, train, bus, gas) -
// these don't go through the cart, a single order is created immediately.
bookingsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "listingId is required" });
  }
  const { listingId, quantity, details } = parsed.data;

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });

  if (!BOOKING_CATEGORY_SLUGS.includes(listing.categorySlug)) {
    return res.status(400).json({
      error: "not_bookable",
      message: "This category is bought via the cart, not booked directly",
    });
  }

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

  res.status(201).json(toOrder(order));
});
