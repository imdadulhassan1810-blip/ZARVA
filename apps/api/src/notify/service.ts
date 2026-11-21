import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import { notifications, users } from "../db/schema";
import type { MessageChannel, NotifyChannel } from "./providers";
import { clipVar, renderText, type NotifyEvent, type NotifyVars } from "./templates";

const MAX_ATTEMPTS = 5;
/** Wait after the 1st, 2nd, 3rd, 4th failure. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000];
/** A claimed row that never finished (crash mid-send) is picked up again after this. */
const CLAIM_MS = 120_000;
/** "Your pro is on the way" is useless a day later. */
const EXPIRE_MS = 12 * 3600_000;

export interface NotifyInput<E extends NotifyEvent> {
  event: E;
  vars: NotifyVars<E>;
  /** The account to reach: its verified phone, and WhatsApp if they opted in. */
  userId: string;
  /** Same key = one message, however many times this is called. */
  dedupeKey: string;
}

/**
 * SMS + WhatsApp updates through an outbox table. notify() writes rows inside the caller's
 * transaction; a loop in the API process sends them, retrying with backoff. Safe with several API
 * instances: rows are claimed with FOR UPDATE SKIP LOCKED.
 */
export class NotificationService {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    private db: Db,
    /** Missing channel = that channel is off. */
    private channels: Partial<Record<NotifyChannel, MessageChannel>>,
    private now: () => Date = () => new Date(),
    private log: (msg: string) => void = (m) => console.warn(m),
  ) {}

  get enabled(): NotifyChannel[] {
    return (Object.keys(this.channels) as NotifyChannel[]).filter((c) => this.channels[c]);
  }

  async notify<E extends NotifyEvent>(db: Db | Tx, input: NotifyInput<E>): Promise<void> {
    if (this.enabled.length === 0) return;
    const u = await db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { phone: true, whatsappOptIn: true } });
    if (!u?.phone) return;
    const vars = Object.fromEntries(Object.entries(input.vars as Record<string, string>).map(([k, v]) => [k, clipVar(String(v))]));
    const body = renderText(input.event, vars);
    const wanted = this.enabled.filter((c) => c === "sms" || (c === "whatsapp" && u.whatsappOptIn));
    if (wanted.length === 0) return;
    const at = this.now();
    await db
      .insert(notifications)
      .values(wanted.map((channel) => ({
        channel, userId: input.userId, toPhone: u.phone!, event: input.event, vars, body, dedupeKey: input.dedupeKey,
        createdAt: at, nextAttemptAt: at,
      })))
      .onConflictDoNothing();
    this.kick();
  }

  /** Send everything due now. Returns how many rows were handled. */
  async dispatch(limit = 25): Promise<number> {
    const now = this.now();
    const claimed = await this.db.transaction(async (tx) => {
      const due = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.status, "queued"), lte(notifications.nextAttemptAt, now)))
        .orderBy(asc(notifications.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) return [];
      return tx
        .update(notifications)
        .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + CLAIM_MS) })
        .where(inArray(notifications.id, due.map((d) => d.id)))
        .returning();
    });

    for (const n of claimed) {
      const ch = this.channels[n.channel];
      const done = (set: Partial<typeof notifications.$inferInsert>) =>
        this.db.update(notifications).set(set).where(eq(notifications.id, n.id));
      if (!ch) {
        await done({ status: "skipped", lastError: `${n.channel} is switched off` });
        continue;
      }
      if (now.getTime() - n.createdAt.getTime() > EXPIRE_MS) {
        await done({ status: "skipped", lastError: "Expired before it could be sent" });
        continue;
      }
      try {
        const r = await ch.send({ to: n.toPhone, event: n.event as NotifyEvent, vars: n.vars as Record<string, string>, text: n.body });
        if (r.status === "skipped") this.log(`[notify] ${n.channel} ${n.event} skipped: ${r.reason}`);
        await done({ status: r.status, providerMessageId: r.providerMessageId ?? null, lastError: r.reason ?? null, sentAt: r.status === "sent" ? this.now() : null });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 500);
        const final = n.attempts >= MAX_ATTEMPTS;
        this.log(`[notify] ${n.channel} ${n.event} to ${n.toPhone} failed (attempt ${n.attempts}): ${msg}`);
        await done(final
          ? { status: "failed", lastError: msg }
          : { lastError: msg, nextAttemptAt: new Date(this.now().getTime() + BACKOFF_MS[Math.min(n.attempts - 1, BACKOFF_MS.length - 1)]!) });
      }
    }
    return claimed.length;
  }

  /** Run until nothing is due. Tests and shutdown use this. */
  async flush(): Promise<void> {
    if (this.running) await this.running.catch(() => 0);
    while ((await this.dispatch()) > 0) { /* keep going */ }
  }

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.dispatch().catch((e: Error) => { this.log(`[notify] dispatch error: ${e.message}`); return 0; });
    void this.running.finally(() => { this.running = null; });
  }

  /** Send soon after a change, without waiting for the next interval. Only when the loop is on. */
  private kick(): void {
    if (!this.timer) return;
    // The row becomes visible once the caller's transaction commits; give it a moment.
    setTimeout(() => this.tick(), 300).unref();
  }
}
