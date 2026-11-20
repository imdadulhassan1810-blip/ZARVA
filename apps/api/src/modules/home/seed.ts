import { inArray, sql } from "drizzle-orm";
import { phoneSchema } from "@zarva/core";
import { createDb, type Db } from "../../db/client";
import { users } from "../../db/schema";
import { categories, cities, demoPros } from "./seed-data";
import { homeCategories, homeCities, homePros, homeServices } from "./schema";

/**
 * Upserts cities, categories and services by id/slug, so it is safe to run again after
 * editing seed-data.ts. Admin price edits are overwritten by a re-run: that is intended for dev.
 */
export async function seedHomeCatalog(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const c of cities) {
      await tx.insert(homeCities).values(c).onConflictDoUpdate({
        target: homeCities.id, set: { name: c.name, state: c.state, active: c.active, pincodes: c.pincodes, sort: c.sort },
      });
    }
    for (const [i, cat] of categories.entries()) {
      const [row] = await tx
        .insert(homeCategories)
        .values({ slug: cat.slug, name: cat.name, icon: cat.icon, description: cat.description, sort: i })
        .onConflictDoUpdate({ target: homeCategories.slug, set: { name: cat.name, icon: cat.icon, description: cat.description, sort: i, active: true } })
        .returning();
      for (const [j, s] of cat.services.entries()) {
        const values = {
          categoryId: row!.id, slug: s.slug, name: s.name, description: s.description, pricePaise: s.price * 100,
          durationMin: s.minutes, inclusions: s.inclusions, sort: j, active: true,
        };
        await tx.insert(homeServices).values(values).onConflictDoUpdate({ target: homeServices.slug, set: values });
      }
    }
  });
}

/** Local testing only: creates active Durgapur pros you can sign in as (OTP prints in the API log). */
export async function seedHomeDemoPros(db: Db): Promise<void> {
  const cats = await db.select().from(homeCategories);
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  for (const p of demoPros) {
    const phone = phoneSchema.parse(p.phone);
    const [u] = await db.insert(users).values({ phone, name: p.name }).onConflictDoUpdate({ target: users.phone, set: { name: p.name } }).returning();
    const categoryIds = p.categories.map((s) => idBySlug.get(s)!).filter(Boolean);
    await db
      .insert(homePros)
      .values({ userId: u!.id, name: p.name, cityId: "durgapur", categoryIds, locality: p.locality, status: "active" })
      .onConflictDoUpdate({ target: homePros.userId, set: { name: p.name, categoryIds, locality: p.locality, status: "active" } });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const withDemo = process.argv.includes("--demo");
  if (withDemo && process.env.NODE_ENV === "production") throw new Error("Refusing to create demo pros in production");
  const { db, sql: conn } = createDb(url);
  await seedHomeCatalog(db);
  if (withDemo) await seedHomeDemoPros(db);
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(homeServices);
  const pros = withDemo ? await db.select().from(homePros).where(inArray(homePros.cityId, ["durgapur"])) : [];
  console.log(`Home services seeded: ${n?.n} services${withDemo ? `, ${pros.length} demo pros (phones 90000 00001-08)` : ""}`);
  await conn.end();
}
