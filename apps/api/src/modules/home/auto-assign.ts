import type { FastifyInstance } from "fastify";
import type { HomeServicesService } from "./service";

/**
 * Background loop for auto-assign (see HomeServicesService.dispatchTick): catches bookings paid by
 * webhook only, retries ones nobody was free for (a partner may switch on), and cancels with a full
 * refund the ones still unassigned close to the slot. Bookings are also placed the moment they are
 * paid, rescheduled or dropped, so this loop is the safety net, not the main path.
 */
export class AutoAssigner {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(private svc: HomeServicesService, private log: (m: string) => void = console.error) {}

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass now. Tests call this directly. */
  async runOnce() {
    return this.svc.dispatchTick();
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.svc.dispatchTick().catch((e: Error) => this.log(`[auto-assign] ${e.message}`));
    void this.running.finally(() => { this.running = null; });
  }
}

/** One per app instance, so the server can start it and tests can run it. */
export const homeAutoAssigners = new WeakMap<FastifyInstance, AutoAssigner>();
