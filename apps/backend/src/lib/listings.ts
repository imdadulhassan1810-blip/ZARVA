import type { Listing as PrismaListing, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fetchOpenFoodFactsProduct } from "../providers/openFoodFacts";

/**
 * Live-provider listings (e.g. "off:<barcode>" from Open Food Facts) aren't seeded
 * in our Listing table, so cart/booking rows — which have a real foreign key to
 * Listing — can't reference them directly. The first time a live listing is actually
 * added to a cart or booked, we persist it as a normal Listing row (same id), so the
 * rest of the system (cart, checkout, orders) doesn't need to know it came from an
 * external API at all.
 */
export async function ensureListingExists(id: string): Promise<PrismaListing | null> {
  const existing = await prisma.listing.findUnique({ where: { id } });
  if (existing) return existing;

  if (id.startsWith("off:")) {
    const barcode = id.slice("off:".length);
    const listing = await fetchOpenFoodFactsProduct(barcode);
    if (!listing) return null;
    return prisma.listing.create({
      data: {
        id: listing.id,
        categorySlug: listing.categorySlug,
        title: listing.title,
        subtitle: listing.subtitle ?? null,
        imageEmoji: listing.imageEmoji,
        imageUrl: listing.imageUrl ?? null,
        price: listing.price,
        priceUnit: listing.priceUnit,
        rating: listing.rating ?? null,
        location: listing.location ?? null,
        tags: listing.tags,
        meta: listing.meta as Prisma.InputJsonValue,
        source: listing.source ?? null,
      },
    });
  }

  return null;
}
