import type { User as PrismaUser, Listing as PrismaListing, Order as PrismaOrder, CartItem as PrismaCartItem } from "@prisma/client";
import type { AdminOrder, AdminUser, Listing, Order, User, CartItem } from "@oneapp/shared";

export function toPublicUser(user: PrismaUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === "admin" ? "admin" : "user",
    authProvider: user.googleId ? "google" : "password",
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAdminUser(user: PrismaUser, orderCount: number, totalSpent: number): AdminUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === "admin" ? "admin" : "user",
    authProvider: user.googleId ? "google" : "password",
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    orderCount,
    totalSpent,
  };
}

export function toListing(listing: PrismaListing): Listing {
  return {
    id: listing.id,
    categorySlug: listing.categorySlug,
    title: listing.title,
    subtitle: listing.subtitle,
    imageEmoji: listing.imageEmoji,
    imageUrl: listing.imageUrl,
    price: listing.price,
    priceUnit: listing.priceUnit,
    rating: listing.rating,
    location: listing.location,
    tags: listing.tags,
    meta: (listing.meta as Record<string, unknown>) ?? {},
    source: listing.source ?? undefined,
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
    paymentMethod: (order.paymentMethod as Order["paymentMethod"]) ?? "mock",
    categorySlug: order.categorySlug,
    total: order.total,
    items: order.items as unknown as Order["items"],
    details: (order.details as Record<string, unknown>) ?? {},
    createdAt: order.createdAt.toISOString(),
  };
}

export function toAdminOrder(order: PrismaOrder & { user: PrismaUser }): AdminOrder {
  return {
    ...toOrder(order),
    userId: order.userId,
    userName: order.user.name,
    userEmail: order.user.email,
  };
}
