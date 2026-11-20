import type { FastifyInstance } from "fastify";
import type { ZarvaModule } from "@zarva/core";
import { verticals } from "@zarva/brand";
import { homeRoutes } from "./routes";
import { HomeServicesService } from "./service";

/** Home services: Urban Company style bookings. Launch city Durgapur, then Asansol, then Kolkata. */
export const homeModule: ZarvaModule<FastifyInstance> = {
  manifest: { id: "home", name: verticals.home.label, version: "1.0.0", tagline: "Cleaning, repairs and beauty at home" },
  register({ app, prefix }) {
    const svc = new HomeServicesService(app.db, app.services.payments, app.now);
    app.get(`${prefix}/status`, async () => ({ module: "home", ready: true }));
    homeRoutes(app, prefix, svc);
  },
};
