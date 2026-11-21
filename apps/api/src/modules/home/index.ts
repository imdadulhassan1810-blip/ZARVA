import type { FastifyInstance } from "fastify";
import type { ZarvaModule } from "@zarva/core";
import { verticals } from "@zarva/brand";
import { homeRoutes } from "./routes";
import { HomeServicesService } from "./service";
import { PartnerService } from "./partners";
import { EarningsService } from "./earnings";

/** Home services: Urban Company style bookings. Launch city Durgapur, then Asansol, then Kolkata. */
export const homeModule: ZarvaModule<FastifyInstance> = {
  manifest: { id: "home", name: verticals.home.label, version: "1.0.0", tagline: "Cleaning, repairs and beauty at home" },
  register({ app, prefix }) {
    const { notify, payouts, vault, payments } = app.services;
    const earnings = new EarningsService(app.db, payouts, notify, app.now);
    const svc = new HomeServicesService(app.db, payments, app.now, notify, earnings);
    const partners = new PartnerService(app.db, vault, notify, app.now);
    app.get(`${prefix}/status`, async () => ({ module: "home", ready: true }));
    homeRoutes(app, prefix, { svc, partners, earnings });
  },
};
