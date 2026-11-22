import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  bookingCode, emptyRatingSummary, HOME_REVIEW_RULES, homeReviewBadTags, homeReviewGoodTags, reviewerName,
  type HomeBookingReviewState, type HomeRatingSummary, type HomeReview, type HomeReviewInput, type HomeReviewTag,
} from "@zarva/core";
import type { Db } from "../../db/client";
import { users } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { homeBookingEvents, homeBookingItems, homeBookings, homeCategories, homePros, homeReviews } from "./schema";

type ReviewRow = typeof homeReviews.$inferSelect;
const DAY = 86_400_000;

/**
 * Ratings and reviews. Only the customer who booked a job can rate it, only once it is completed,
 * and only within HOME_REVIEW_RULES.windowDays. So every review on ZARVA is from a real, finished job.
 * Admin can hide a review (abuse, personal details) but never edit what the customer wrote.
 *
 * Never use this.db inside a transaction callback (the demo database has one connection).
 */
export class ReviewService {
  constructor(private db: Db, private now: () => Date) {}

  /** When the job was marked completed, or null if it never was. */
  private async completedAt(bookingId: string): Promise<Date | null> {
    const [e] = await this.db
      .select({ at: homeBookingEvents.createdAt })
      .from(homeBookingEvents)
      .where(and(eq(homeBookingEvents.bookingId, bookingId), eq(homeBookingEvents.status, "completed")))
      .orderBy(homeBookingEvents.seq)
      .limit(1);
    return e?.at ?? null;
  }

  async forBooking(userId: string, bookingId: string): Promise<HomeBookingReviewState> {
    const b = await this.db.query.homeBookings.findFirst({ where: and(eq(homeBookings.id, bookingId), eq(homeBookings.userId, userId)) });
    if (!b) throw notFound("Booking");
    const row = await this.db.query.homeReviews.findFirst({ where: eq(homeReviews.bookingId, bookingId) });
    const review = row ? (await this.present([row], true))[0]! : null;
    if (b.status !== "completed") return { review, canReview: false, canEdit: false };
    const done = await this.completedAt(bookingId);
    const open = !!done && this.now().getTime() - done.getTime() <= HOME_REVIEW_RULES.windowDays * DAY;
    const editable = !!row && !row.hiddenAt && this.now().getTime() - row.createdAt.getTime() <= HOME_REVIEW_RULES.editDays * DAY;
    return { review, canReview: !row && open, canEdit: editable };
  }

  async submit(userId: string, bookingId: string, input: HomeReviewInput): Promise<HomeBookingReviewState> {
    const b = await this.db.query.homeBookings.findFirst({ where: and(eq(homeBookings.id, bookingId), eq(homeBookings.userId, userId)) });
    if (!b) throw notFound("Booking");
    if (b.status !== "completed") throw badRequest("not_completed", "You can rate a job once it is completed");
    const state = await this.forBooking(userId, bookingId);
    // Tags must match the stars, so a 1-star review can't say "Polite, On time" by accident.
    const allowed: HomeReviewTag[] = input.rating >= 4 ? homeReviewGoodTags : input.rating <= 2 ? homeReviewBadTags : [...homeReviewGoodTags, ...homeReviewBadTags];
    const tags = [...new Set(input.tags)].filter((t) => allowed.includes(t));
    const comment = input.comment?.trim() ? input.comment.trim() : null;

    if (state.review) {
      if (!state.canEdit) throw badRequest("review_locked", `Ratings can be changed for ${HOME_REVIEW_RULES.editDays} days after posting`);
      await this.db.update(homeReviews).set({ rating: input.rating, comment, tags, updatedAt: this.now() }).where(eq(homeReviews.bookingId, bookingId));
    } else {
      if (!state.canReview) throw badRequest("review_closed", `Jobs can be rated for ${HOME_REVIEW_RULES.windowDays} days after completion`);
      const u = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
      await this.db
        .insert(homeReviews)
        .values({
          bookingId, userId, proId: b.proId, categoryId: b.categoryId, rating: input.rating, comment, tags,
          customerName: reviewerName(u?.name), createdAt: this.now(), updatedAt: this.now(),
        })
        // A double tap posts once.
        .onConflictDoNothing({ target: homeReviews.bookingId });
    }
    return this.forBooking(userId, bookingId);
  }

  /** Published reviews, newest first. Filter by category slug or by pro. */
  async list(opts: { categorySlug?: string; proId?: string; minRating?: number; withComment?: boolean; limit?: number } = {}): Promise<HomeReview[]> {
    let categoryId: string | undefined;
    if (opts.categorySlug) {
      const c = await this.db.query.homeCategories.findFirst({ where: eq(homeCategories.slug, opts.categorySlug), columns: { id: true } });
      if (!c) return [];
      categoryId = c.id;
    }
    const rows = await this.db
      .select()
      .from(homeReviews)
      .where(and(
        isNull(homeReviews.hiddenAt),
        categoryId ? eq(homeReviews.categoryId, categoryId) : undefined,
        opts.proId ? eq(homeReviews.proId, opts.proId) : undefined,
        opts.minRating ? sql`${homeReviews.rating} >= ${opts.minRating}` : undefined,
        opts.withComment ? sql`coalesce(length(${homeReviews.comment}), 0) > 0` : undefined,
      ))
      .orderBy(desc(homeReviews.createdAt))
      .limit(Math.min(opts.limit ?? 20, 50));
    return this.present(rows, false);
  }

  /** Overall and per-category (by slug) rating summaries of published reviews. */
  async summaries(): Promise<{ overall: HomeRatingSummary; categories: Record<string, HomeRatingSummary> }> {
    const rows = await this.db
      .select({ slug: homeCategories.slug, rating: homeReviews.rating, n: sql<number>`count(*)::int` })
      .from(homeReviews)
      .innerJoin(homeCategories, eq(homeCategories.id, homeReviews.categoryId))
      .where(isNull(homeReviews.hiddenAt))
      .groupBy(homeCategories.slug, homeReviews.rating);
    const overall = emptyRatingSummary();
    const categories: Record<string, HomeRatingSummary> = {};
    for (const r of rows) {
      categories[r.slug] ??= emptyRatingSummary();
      for (const s of [overall, categories[r.slug]!]) {
        s.stars[r.rating - 1]! += r.n;
        s.count += r.n;
      }
    }
    for (const s of [overall, ...Object.values(categories)]) finish(s);
    return { overall, categories };
  }

  async proSummaries(proIds: string[]): Promise<Map<string, HomeRatingSummary>> {
    const out = new Map<string, HomeRatingSummary>();
    if (proIds.length === 0) return out;
    const rows = await this.db
      .select({ proId: homeReviews.proId, rating: homeReviews.rating, n: sql<number>`count(*)::int` })
      .from(homeReviews)
      .where(and(isNull(homeReviews.hiddenAt), inArray(homeReviews.proId, proIds)))
      .groupBy(homeReviews.proId, homeReviews.rating);
    for (const id of proIds) out.set(id, emptyRatingSummary());
    for (const r of rows) {
      const s = out.get(r.proId!)!;
      s.stars[r.rating - 1]! += r.n;
      s.count += r.n;
    }
    for (const s of out.values()) finish(s);
    return out;
  }

  /** The partner app's "My ratings": summary and the latest reviews about this pro. */
  async forPro(proId: string): Promise<{ summary: HomeRatingSummary; reviews: HomeReview[] }> {
    const summary = (await this.proSummaries([proId])).get(proId)!;
    return { summary, reviews: await this.list({ proId, limit: 30 }) };
  }

  // ---------- Admin ----------

  async adminList(opts: { hidden?: boolean; maxRating?: number }): Promise<HomeReview[]> {
    const rows = await this.db
      .select()
      .from(homeReviews)
      .where(and(
        opts.hidden === undefined ? undefined : opts.hidden ? sql`${homeReviews.hiddenAt} is not null` : isNull(homeReviews.hiddenAt),
        opts.maxRating ? sql`${homeReviews.rating} <= ${opts.maxRating}` : undefined,
      ))
      .orderBy(desc(homeReviews.createdAt))
      .limit(100);
    return this.present(rows, true);
  }

  async setHidden(adminId: string, id: string, hidden: boolean, reason?: string): Promise<HomeReview> {
    const [r] = await this.db
      .update(homeReviews)
      .set(hidden ? { hiddenAt: this.now(), hiddenReason: reason ?? null, hiddenBy: adminId } : { hiddenAt: null, hiddenReason: null, hiddenBy: null })
      .where(eq(homeReviews.id, id))
      .returning();
    if (!r) throw notFound("Review");
    return (await this.present([r], true))[0]!;
  }

  private async present(rows: ReviewRow[], full: boolean): Promise<HomeReview[]> {
    if (rows.length === 0) return [];
    const bookingIds = rows.map((r) => r.bookingId);
    const [cats, pros, items] = await Promise.all([
      this.db.select({ id: homeCategories.id, name: homeCategories.name, slug: homeCategories.slug }).from(homeCategories),
      this.db.select({ id: homePros.id, name: homePros.name }).from(homePros).where(inArray(homePros.id, rows.map((r) => r.proId).filter((x): x is string => !!x).concat(["00000000-0000-0000-0000-000000000000"]))),
      this.db.select({ bookingId: homeBookingItems.bookingId, name: homeBookingItems.name }).from(homeBookingItems).where(inArray(homeBookingItems.bookingId, bookingIds)),
    ]);
    const cat = new Map(cats.map((c) => [c.id, c]));
    const pro = new Map(pros.map((p) => [p.id, p.name]));
    return rows.map((r) => {
      const names = items.filter((i) => i.bookingId === r.bookingId).map((i) => i.name).sort();
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        tags: r.tags as HomeReviewTag[],
        customerName: r.customerName,
        categoryName: cat.get(r.categoryId)?.name ?? "",
        categorySlug: cat.get(r.categoryId)?.slug ?? "",
        // Public pages show the pro's first name only.
        proName: r.proId ? (full ? pro.get(r.proId) ?? null : (pro.get(r.proId) ?? "").split(" ")[0] || null) : null,
        serviceNames: names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", "),
        createdAt: r.createdAt.toISOString(),
        ...(full ? { hidden: !!r.hiddenAt, hiddenReason: r.hiddenReason, bookingCode: bookingCode(r.bookingId) } : {}),
      };
    });
  }
}

function finish(s: HomeRatingSummary) {
  const sum = s.stars.reduce((a, n, i) => a + n * (i + 1), 0);
  s.average = s.count ? Math.round((sum / s.count) * 10) / 10 : null;
}
