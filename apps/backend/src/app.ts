import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { listingsRouter } from "./routes/listings";
import { cartRouter } from "./routes/cart";
import { bookingsRouter } from "./routes/bookings";
import { billsRouter } from "./routes/bills";
import { ordersRouter } from "./routes/orders";
import { paymentsRouter } from "./routes/payments";
import { geocodeRouter } from "./routes/geocode";
import { notificationsRouter } from "./routes/notifications";
import { cabsRouter } from "./routes/cabs";
import { trackingRouter } from "./routes/tracking";
import { adminRouter } from "./routes/admin";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/cart", cartRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/bills", billsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/geocode", geocodeRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/cabs", cabsRouter);
  app.use("/api/tracking", trackingRouter);
  app.use("/api/admin", adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Something went wrong" });
  });

  return app;
}
