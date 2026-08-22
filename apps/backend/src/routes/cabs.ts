import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { computeCabFare } from "../lib/pricing";

export const cabsRouter = Router();

const geoPointSchema = z.object({ lat: z.number(), lng: z.number(), address: z.string().optional() });

const quoteSchema = z.object({
  listingId: z.string().min(1),
  pickup: geoPointSchema,
  drop: geoPointSchema,
});

cabsRouter.post("/quote", async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", message: "listingId, pickup and drop are required" });
  }
  const { listingId, pickup, drop } = parsed.data;

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.categorySlug !== "cab") {
    return res.status(404).json({ error: "not_found", message: "Cab listing not found" });
  }

  const meta = (listing.meta as Record<string, unknown>) ?? {};
  const rates = {
    baseFare: listing.price,
    perKmRate: typeof meta.perKmRate === "number" ? meta.perKmRate : 12,
    perMinRate: typeof meta.perMinRate === "number" ? meta.perMinRate : 1.5,
    avgSpeedKmh: typeof meta.avgSpeedKmh === "number" ? meta.avgSpeedKmh : 28,
  };

  const quote = computeCabFare(rates, pickup, drop);
  res.json(quote);
});
