import { Router } from "express";
import { CATEGORIES } from "@oneapp/shared";
import { prisma } from "../lib/prisma";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  const counts = await prisma.listing.groupBy({
    by: ["categorySlug"],
    _count: { _all: true },
  });
  const countBySlug = Object.fromEntries(counts.map((c) => [c.categorySlug, c._count._all]));

  res.json(
    CATEGORIES.map((c) => ({
      slug: c.slug,
      count: countBySlug[c.slug] ?? 0,
    })),
  );
});
