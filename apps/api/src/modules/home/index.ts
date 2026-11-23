import type { FastifyInstance } from "fastify";
import type { ZarvaModule } from "@zarva/core";
import { verticals } from "@zarva/brand";
import { homeRoutes } from "./routes";
import { HomeServicesService } from "./service";
import { PartnerService } from "./partners";
import { EarningsService } from "./earnings";
import { InvoiceService } from "./invoices";
import { ReviewService } from "./reviews";
import { PolicyService } from "./policy";
import { CancellationService } from "./cancellations";
import { AutoAssigner, homeAutoAssigners } from "./auto-assign";
import { bookingCode } from "@zarva/core";
import { and, eq } from "drizzle-orm";
import { homeBookings, homeCategories } from "./schema";

/** Home services: Urban Company style bookings. Launch city Durgapur, then Asansol, then Kolkata. */
export const homeModule: ZarvaModule<FastifyInstance> = {
  manifest: { id: "home", name: verticals.home.label, version: "1.0.0", tagline: "Cleaning, repairs and beauty at home" },
  register({ app, prefix }) {
    const { notify, payouts, vault, payments } = app.services;
    const policy = new PolicyService(app.db);
    const cancellations = new CancellationService(app.db, policy, app.now);
    const earnings = new EarningsService(app.db, payouts, notify, app.now, cancellations);
    const invoices = new InvoiceService(app.db, app.config, app.now);
    const reviews = new ReviewService(app.db, app.now);
    const svc = new HomeServicesService(app.db, payments, app.now, notify, earnings, invoices, reviews, policy, cancellations, { onlinePayments: app.config.onlinePayments });
    const partners = new PartnerService(app.db, vault, notify, app.now);
    app.get(`${prefix}/status`, async () => ({ module: "home", ready: true }));
    // Places paid bookings with free professionals every 15 seconds once the server calls start().
    homeAutoAssigners.set(app, new AutoAssigner(svc));
    app.addHook("onClose", async () => homeAutoAssigners.get(app)?.stop());
    homeRoutes(app, prefix, { svc, partners, earnings, invoices, reviews, policy });
    // Support tickets can point at a home booking: only the customer's own, labelled for the team.
    app.services.support.registerReference("home", async (userId, referenceId) => {
      const [b] = await app.db
        .select({ id: homeBookings.id, category: homeCategories.name })
        .from(homeBookings)
        .innerJoin(homeCategories, eq(homeCategories.id, homeBookings.categoryId))
        .where(and(eq(homeBookings.id, referenceId), eq(homeBookings.userId, userId)));
      return b ? `Booking ${bookingCode(b.id)} · ${b.category}` : null;
    });
  },
};
