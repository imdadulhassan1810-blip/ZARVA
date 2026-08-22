import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { toCartItem, toOrder } from "../lib/serialize";

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

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });

  await prisma.cartItem.upsert({
    where: { userId_listingId: { userId: req.userId!, listingId } },
    update: { quantity: { increment: quantity } },
    create: { userId: req.userId!, listingId, quantity },
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

const checkoutSchema = z.object({ details: z.record(z.unknown()).optional() });

cartRouter.post("/checkout", async (req: AuthedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body ?? {});
  const details = parsed.success ? (parsed.data.details ?? {}) : {};

  const items = await prisma.cartItem.findMany({
    where: { userId: req.userId! },
    include: { listing: true },
  });
  if (items.length === 0) {
    return res.status(400).json({ error: "empty_cart", message: "Your cart is empty" });
  }

  const total = items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
  const categorySlug = items[0].listing.categorySlug;
  const orderItems = items.map((i) => ({
    listingTitle: i.listing.title,
    categorySlug: i.listing.categorySlug,
    quantity: i.quantity,
    unitPrice: i.listing.price,
  }));

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: req.userId!,
        type: "purchase",
        status: "confirmed",
        categorySlug,
        total,
        items: orderItems as Prisma.InputJsonValue,
        details: details as Prisma.InputJsonValue,
      },
    });
    await tx.cartItem.deleteMany({ where: { userId: req.userId! } });
    return created;
  });

  res.status(201).json(toOrder(order));
});
