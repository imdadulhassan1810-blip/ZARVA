import type { FastifyInstance } from "fastify";
import { verticals, type VerticalId } from "@zarva/brand";
import { ModuleRegistry, type ZarvaModule } from "@zarva/core";
import { homeModule } from "./home";

/**
 * Every vertical lives in its own folder under src/modules/<id>/ and exports a ZarvaModule.
 * Built so far: home (home services). The rest are placeholders that only mount a status route.
 * To build a vertical: replace its placeholder with a real module (own tables prefixed
 * `<id>_`, own routes under ctx.prefix), take money only through app.services.payments,
 * then add its id to ENABLED_MODULES.
 */
const taglines: Record<VerticalId, string> = {
  food: "Meals from local restaurants",
  shopping: "Groceries and essentials",
  events: "Shows, concerts and sports",
  travel: "Hotels, buses, trains and rides",
  home: "Cleaning, repairs and beauty at home",
};

function placeholder(id: VerticalId): ZarvaModule<FastifyInstance> {
  return {
    manifest: { id, name: verticals[id].label, version: "0.0.0", tagline: taglines[id] },
    register({ app, prefix }) {
      app.get(`${prefix}/status`, async () => ({ module: id, ready: false }));
    },
  };
}

export function buildRegistry(): ModuleRegistry<FastifyInstance> {
  const reg = new ModuleRegistry<FastifyInstance>();
  const built: Partial<Record<VerticalId, ZarvaModule<FastifyInstance>>> = { home: homeModule };
  for (const id of Object.keys(verticals) as VerticalId[]) reg.add(built[id] ?? placeholder(id));
  return reg;
}
