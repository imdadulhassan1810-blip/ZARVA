import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { toListing } from "../lib/serialize";

export const listingsRouter = Router();

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
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  res.json(toListing(listing));
});
