import { runMigrations } from "../src/db/migrate";

export default async function setup() {
  process.env.TEST_DATABASE_URL ??= "postgres://zarva:zarva@localhost:5432/zarva_test";
  await runMigrations(process.env.TEST_DATABASE_URL);
}
