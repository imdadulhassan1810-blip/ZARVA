import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";
import { createDb, schema } from "./client";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * DATABASE_URL can be:
 *  - postgres://...   a real PostgreSQL server (production, CI, tests)
 *  - pglite           built-in demo database stored in apps/api/.data (no install needed)
 *  - pglite:<folder>  same, stored in <folder>
 * Migrations run automatically on start.
 */
export async function connectDb(url: string): Promise<{ db: Db; close: () => Promise<void>; kind: "postgres" | "pglite" }> {
  if (url === "pglite" || url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = url === "pglite" ? fileURLToPath(new URL("../../.data", import.meta.url)) : url.slice("pglite:".length);
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    // Same query builder API as postgres-js; the drivers differ only in how they connect.
    return { db: db as unknown as Db, close: () => client.close(), kind: "pglite" };
  }
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db, sql } = createDb(url);
  await migrate(db, { migrationsFolder });
  return { db, close: () => sql.end(), kind: "postgres" };
}
