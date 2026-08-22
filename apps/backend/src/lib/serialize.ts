import type { User as PrismaUser, Listing as PrismaListing, Order as PrismaOrder, CartItem as PrismaCartItem } from "@prisma/client";
import type { Listing, Order, User, CartItem } from "@oneapp/shared";

export function toPublicUser(user: PrismaUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toListing(listing: PrismaListing): Listing {
  return {
    id: listing.id,
    categorySlug: listing.categorySlug,
    title: listing.title,
    subtitle: listing.subtitle,
    imageEmoji: listing.imageEmoji,
    price: listing.price,
    priceUnit: listing.priceUnit,
    rating: listing.rating,
    location: listing.location,
    tags: listing.tags,
    meta: (listing.meta as Record<string, unknown>) ?? {},
  };
}

export function toCartItem(item: PrismaCartItem & { listing: PrismaListing }): CartItem {
  return {
    id: item.id,
    listingId: item.listingId,
    listing: toListing(item.listing),
    quantity: item.quantity,
  };
}

export function toOrder(order: PrismaOrder): Order {
  return {
    id: order.id,
    type: order.type as Order["type"],
    status: order.status as Order["status"],
    categorySlug: order.categorySlug,
    total: order.total,
    items: order.items as unknown as Order["items"],
    details: (order.details as Record<string, unknown>) ?? {},
    createdAt: order.createdAt.toISOString(),
  };
}
