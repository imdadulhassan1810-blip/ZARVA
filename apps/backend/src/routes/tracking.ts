import { Router } from "express";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { computeTrackingState } from "../lib/tracking";
import type { TrackingSpec } from "../lib/tracking";

export const trackingRouter = Router();
trackingRouter.use(requireAuth);

trackingRouter.get("/:orderId", async (req: AuthedRequest, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ error: "not_found", message: "Order not found" });
  }

  const details = (order.details as Record<string, unknown>) ?? {};
  const spec = details.tracking as TrackingSpec | undefined;
  if (!spec) {
    return res.status(404).json({ error: "no_tracking", message: "This order doesn't have live tracking" });
  }

  const state = computeTrackingState(order.id, spec);

  // Once the simulated journey finishes, flip the order's own status too so order
  // history reflects it without the client having to poll forever.
  if (state.status === "completed" && order.status !== "completed" && order.status !== "cancelled") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "completed" } });
  }

  res.json(state);
});
