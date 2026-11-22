import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  SUPPORT_RULES, supportStatusLabel, supportTopicLabel, ticketCode,
  type Feedback, type FeedbackInput, type SupportCreate, type SupportStatus, type SupportTicket, type SupportTopic,
} from "@zarva/core";
import type { Db } from "../db/client";
import { adminAccounts, feedback, supportMessages, supportTickets, users } from "../db/schema";
import { AppError, badRequest, notFound } from "../lib/errors";

type TicketRow = typeof supportTickets.$inferSelect;
/** Returns a label like "Booking ZH-7K3QF2 · Electrician" if referenceId is this customer's, else null. */
export type ReferenceResolver = (userId: string, referenceId: string) => Promise<string | null>;
const DAY = 86_400_000;

/**
 * Customer support tickets and app feedback. Customers see only their own tickets; the ZARVA team
 * answers from the admin app. A ticket can point at a booking: the vertical that owns the booking
 * (registerReference) confirms it belongs to the customer, so nobody can attach someone else's.
 *
 * Never use this.db inside a transaction callback (the demo database has one connection).
 */
export class SupportService {
  private resolvers = new Map<string, ReferenceResolver>();

  constructor(private db: Db, private now: () => Date) {}

  registerReference(module: string, resolve: ReferenceResolver) {
    this.resolvers.set(module, resolve);
  }

  // ---------- Customer ----------

  async create(userId: string, input: SupportCreate): Promise<SupportTicket> {
    const since = new Date(this.now().getTime() - DAY);
    const [counts] = await this.db
      .select({
        today: sql<number>`count(*) filter (where ${supportTickets.createdAt} > ${since.toISOString()}::timestamptz)::int`,
        open: sql<number>`count(*) filter (where ${supportTickets.status} <> 'resolved')::int`,
      })
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId));
    if ((counts?.today ?? 0) >= SUPPORT_RULES.perDay) throw new AppError(429, "rate_limited", "You've raised a lot of tickets today. We'll get back on the ones you have.");
    if ((counts?.open ?? 0) >= SUPPORT_RULES.maxOpenTickets) throw badRequest("too_many_open", "You already have several open tickets. Reply on one of those and we'll help there.");

    let referenceLabel: string | null = null;
    if (input.module && input.referenceId) {
      const resolve = this.resolvers.get(input.module);
      referenceLabel = resolve ? await resolve(userId, input.referenceId) : null;
      if (!referenceLabel) throw notFound("Booking");
      // One open ticket per booking: a second one would split the conversation.
      const dup = await this.db.query.supportTickets.findFirst({
        where: and(eq(supportTickets.userId, userId), eq(supportTickets.module, input.module), eq(supportTickets.referenceId, input.referenceId), sql`${supportTickets.status} <> 'resolved'`),
      });
      if (dup) throw new AppError(409, "ticket_exists", `You already have an open ticket for this booking (${ticketCode(dup.seq)}). Add to it there.`, { ticketId: dup.id });
    }

    const id = await this.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(supportTickets)
        .values({
          userId, topic: input.topic, subject: input.subject, module: input.module ?? null, referenceId: input.referenceId ?? null,
          referenceLabel, createdAt: this.now(), updatedAt: this.now(),
        })
        .returning({ id: supportTickets.id });
      await tx.insert(supportMessages).values({ ticketId: t!.id, userId, body: input.message, createdAt: this.now() });
      return t!.id;
    });
    return this.load(id, false);
  }

  async mine(userId: string): Promise<SupportTicket[]> {
    const rows = await this.db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.updatedAt)).limit(50);
    return Promise.all(rows.map((r) => this.load(r.id, false)));
  }

  async get(userId: string, id: string): Promise<SupportTicket> {
    await this.owned(userId, id);
    return this.load(id, false);
  }

  /** Tickets this customer has about one booking (newest first), for "Get help" on the booking page. */
  async forReference(userId: string, module: string, referenceId: string): Promise<SupportTicket[]> {
    const rows = await this.db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(and(eq(supportTickets.userId, userId), eq(supportTickets.module, module), eq(supportTickets.referenceId, referenceId)))
      .orderBy(desc(supportTickets.createdAt));
    return Promise.all(rows.map((r) => this.load(r.id, false)));
  }

  async customerReply(userId: string, id: string, body: string): Promise<SupportTicket> {
    await this.owned(userId, id);
    await this.db.transaction(async (tx) => {
      await tx.insert(supportMessages).values({ ticketId: id, userId, body, createdAt: this.now() });
      // A reply on a resolved ticket reopens it.
      await tx.update(supportTickets).set({ status: "open", resolvedAt: null, resolvedBy: null, updatedAt: this.now() }).where(eq(supportTickets.id, id));
    });
    return this.load(id, false);
  }

  async customerResolve(userId: string, id: string): Promise<SupportTicket> {
    await this.owned(userId, id);
    await this.db.update(supportTickets).set({ status: "resolved", resolvedAt: this.now(), updatedAt: this.now() }).where(eq(supportTickets.id, id));
    return this.load(id, false);
  }

  private async owned(userId: string, id: string): Promise<TicketRow> {
    const t = await this.db.query.supportTickets.findFirst({ where: and(eq(supportTickets.id, id), eq(supportTickets.userId, userId)) });
    if (!t) throw notFound("Ticket");
    return t;
  }

  async sendFeedback(userId: string, input: FeedbackInput): Promise<{ id: string }> {
    const since = new Date(this.now().getTime() - DAY);
    const [c] = await this.db.select({ n: sql<number>`count(*)::int` }).from(feedback).where(and(eq(feedback.userId, userId), gt(feedback.createdAt, since)));
    if ((c?.n ?? 0) >= SUPPORT_RULES.feedbackPerDay) throw new AppError(429, "rate_limited", "Thanks, we've got plenty from you today. Send more tomorrow.");
    const [f] = await this.db
      .insert(feedback)
      .values({ userId, kind: input.kind, rating: input.rating ?? null, message: input.message, platform: input.platform, createdAt: this.now() })
      .returning({ id: feedback.id });
    return { id: f!.id };
  }

  // ---------- Admin ----------

  async adminList(status?: SupportStatus): Promise<{ tickets: SupportTicket[]; counts: Record<SupportStatus, number> }> {
    const rows = await this.db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(status ? eq(supportTickets.status, status) : undefined)
      // Oldest waiting first: that customer has waited longest.
      .orderBy(status === "resolved" ? desc(supportTickets.updatedAt) : asc(supportTickets.updatedAt))
      .limit(100);
    const grouped = await this.db.select({ status: supportTickets.status, n: sql<number>`count(*)::int` }).from(supportTickets).groupBy(supportTickets.status);
    const counts = { open: 0, waiting_customer: 0, resolved: 0 } as Record<SupportStatus, number>;
    for (const g of grouped) counts[g.status] = g.n;
    return { tickets: await Promise.all(rows.map((r) => this.load(r.id, true))), counts };
  }

  async adminGet(id: string): Promise<SupportTicket> {
    return this.load(id, true);
  }

  async adminReply(adminId: string, id: string, body: string, resolve: boolean): Promise<SupportTicket> {
    const t = await this.db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
    if (!t) throw notFound("Ticket");
    await this.db.transaction(async (tx) => {
      await tx.insert(supportMessages).values({ ticketId: id, adminId, body, createdAt: this.now() });
      await tx
        .update(supportTickets)
        .set(resolve
          ? { status: "resolved", resolvedAt: this.now(), resolvedBy: adminId, updatedAt: this.now() }
          : { status: "waiting_customer", updatedAt: this.now() })
        .where(eq(supportTickets.id, id));
    });
    return this.load(id, true);
  }

  async adminSetStatus(adminId: string, id: string, status: SupportStatus): Promise<SupportTicket> {
    const [t] = await this.db
      .update(supportTickets)
      .set(status === "resolved" ? { status, resolvedAt: this.now(), resolvedBy: adminId, updatedAt: this.now() } : { status, resolvedAt: null, resolvedBy: null, updatedAt: this.now() })
      .where(eq(supportTickets.id, id))
      .returning();
    if (!t) throw notFound("Ticket");
    return this.load(id, true);
  }

  async adminFeedback(): Promise<Feedback[]> {
    const rows = await this.db
      .select({ f: feedback, name: users.name, phone: users.phone, email: users.email })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.userId))
      .orderBy(desc(feedback.createdAt))
      .limit(200);
    return rows.map(({ f, name, phone, email }) => ({
      id: f.id, kind: f.kind as Feedback["kind"], rating: f.rating, message: f.message, platform: f.platform, createdAt: f.createdAt.toISOString(),
      customer: f.userId ? { name, phone, email } : null,
    }));
  }

  // ---------- Helpers ----------

  private async load(id: string, admin: boolean): Promise<SupportTicket> {
    const t = await this.db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
    if (!t) throw notFound("Ticket");
    const msgs = await this.db.select().from(supportMessages).where(eq(supportMessages.ticketId, id)).orderBy(asc(supportMessages.seq));
    const adminIds = [...new Set(msgs.map((m) => m.adminId).filter((x): x is string => !!x))];
    const admins = adminIds.length
      ? await this.db.select({ id: adminAccounts.id, name: adminAccounts.name }).from(adminAccounts).where(inArray(adminAccounts.id, adminIds))
      : [];
    const adminName = new Map(admins.map((a) => [a.id, a.name]));
    const customer = await this.db.query.users.findFirst({ where: eq(users.id, t.userId), columns: { id: true, name: true, phone: true, email: true } });
    return {
      id: t.id,
      code: ticketCode(t.seq),
      topic: t.topic as SupportTopic,
      topicLabel: supportTopicLabel[t.topic as SupportTopic] ?? t.topic,
      subject: t.subject,
      status: t.status,
      statusLabel: supportStatusLabel[t.status],
      module: t.module,
      referenceId: t.referenceId,
      referenceLabel: t.referenceLabel,
      messages: msgs.map((m) => ({
        id: m.id,
        from: m.adminId ? "zarva" : "customer",
        // Customers see "ZARVA support" plus the first name of the team member, never a username.
        authorName: m.adminId ? (admin ? adminName.get(m.adminId) ?? "ZARVA team" : `${(adminName.get(m.adminId) ?? "").split(" ")[0] || "ZARVA"} from ZARVA support`) : admin ? customer?.name || "Customer" : "You",
        body: m.body,
        at: m.createdAt.toISOString(),
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      ...(admin && customer ? { customer } : {}),
    };
  }
}
