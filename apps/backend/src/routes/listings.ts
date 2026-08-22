import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { toListing } from "../lib/serialize";
import { fetchOpenFoodFactsProduct, searchOpenFoodFacts } from "../providers/openFoodFacts";

export const listingsRouter = Router();

// Live provider search must be registered before "/:id" so "/live/grocery" isn't
// swallowed by the id route (Express matches by path shape, but keep it explicit).
listingsRouter.get("/live/grocery", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (!query) return res.json([]);

  try {
    const listings = await searchOpenFoodFacts(query);
    res.json(listings);
  } catch (err) {
    console.error("Open Food Facts search failed:", err);
    res.status(502).json({ error: "live_provider_unavailable", message: "Live grocery search is temporarily unavailable" });
  }
});

listingsRouter.get("/", async (req, res) => {
  const { category, query, minPrice, maxPrice, sort } = req.query as Record<string, string | undefined>;

  const where: Prisma.ListingWhereInput = {};
  if (category) where.categorySlug = category;
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { subtitle: { contains: query, mode: "insensitive" } },
      { location: { contains: query, mode: "insensitive" } },
      { tags: { has: query.toLowerCase() } },
    ];
  }
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    sort === "price_asc"
      ? { price: "asc" }
      : sort === "price_desc"
        ? { price: "desc" }
        : sort === "rating_desc"
          ? { rating: "desc" }
          : { createdAt: "desc" };

  const listings = await prisma.listing.findMany({ where, orderBy, take: 100 });
  res.json(listings.map(toListing));
});

listingsRouter.get("/:id", async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (listing) return res.json(toListing(listing));

  // Not persisted yet — if it looks like a live-provider id, fetch it live for viewing.
  // It only gets written to our own table once it's actually added to a cart/booking.
  if (req.params.id.startsWith("off:")) {
    const live = await fetchOpenFoodFactsProduct(req.params.id.slice("off:".length));
    if (live) return res.json(live);
  }

  res.status(404).json({ error: "not_found", message: "Listing not found" });
});
