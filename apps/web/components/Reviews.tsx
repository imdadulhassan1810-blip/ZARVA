"use client";
import { useEffect, useState } from "react";
import {
  HOME_REVIEW_RULES, homeReviewBadTags, homeReviewGoodTags, homeReviewTagLabel,
  type HomeBooking, type HomeBookingReviewState, type HomeRatingSummary, type HomeReview, type HomeReviewTag,
} from "@zarva/core";
import { api } from "../lib/api";

/** Read-only stars, e.g. 4.3 shows four full stars and a part-filled fifth. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${value} out of 5 stars`}>
      <span className="stars-bg" aria-hidden>★★★★★</span>
      <span className="stars-fg" aria-hidden style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

/** "★ 4.6 (23 ratings)", or nothing when there are no ratings yet (never a fake "new" score). */
export function RatingBadge({ summary, compact }: { summary: { average: number | null; count: number } | undefined; compact?: boolean }) {
  if (!summary || !summary.count || summary.average === null) return null;
  return (
    <span className="rating-badge">
      <span aria-hidden>★</span> {summary.average.toFixed(1)}
      <span className="muted"> ({summary.count}{compact ? "" : summary.count === 1 ? " rating" : " ratings"})</span>
    </span>
  );
}

export function StarBars({ summary }: { summary: HomeRatingSummary }) {
  return (
    <div className="star-bars">
      {[5, 4, 3, 2, 1].map((n) => {
        const c = summary.stars[n - 1] ?? 0;
        return (
          <div key={n} className="star-bar">
            <span>{n}★</span>
            <span className="star-bar-track"><span style={{ width: `${summary.count ? (c / summary.count) * 100 : 0}%` }} /></span>
            <span className="muted">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ReviewCard({ r }: { r: HomeReview }) {
  return (
    <article className="review-card">
      <div className="review-head">
        <Stars value={r.rating} size={15} />
        <span className="muted review-date">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>
      {r.comment && <p className="review-text">“{r.comment}”</p>}
      {r.tags.length > 0 && <div className="review-tags">{r.tags.map((t) => <span key={t} className="tag">{homeReviewTagLabel[t]}</span>)}</div>}
      <div className="review-by">
        <strong>{r.customerName}</strong>
        <span className="muted"> · {r.serviceNames || r.categoryName}{r.proName ? ` by ${r.proName}` : ""}</span>
      </div>
    </article>
  );
}

/** Real reviews for one category (or all), with the summary on top. Shows an honest empty state. */
export function CategoryReviews({ categorySlug, categoryName }: { categorySlug: string; categoryName: string }) {
  const [summary, setSummary] = useState<HomeRatingSummary | null>(null);
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  useEffect(() => {
    api.home.ratingSummary().then((r) => setSummary(r.categories[categorySlug] ?? { average: null, count: 0, stars: [0, 0, 0, 0, 0] })).catch(() => {});
    api.home.reviews({ category: categorySlug, limit: 6 }).then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
  }, [categorySlug]);
  if (!summary || !reviews) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <h2>Ratings for {categoryName}</h2>
      {summary.count === 0 ? (
        <p className="muted card">No ratings yet. Every rating here comes from a customer whose job was completed, so this fills up as people book.</p>
      ) : (
        <>
          <div className="card rating-overview">
            <div>
              <div className="rating-big">{summary.average!.toFixed(1)}</div>
              <Stars value={summary.average!} />
              <div className="muted" style={{ fontSize: 13 }}>{summary.count} rating{summary.count === 1 ? "" : "s"}</div>
            </div>
            <StarBars summary={summary} />
          </div>
          <div className="review-grid" style={{ marginTop: 12 }}>{reviews.map((r) => <ReviewCard key={r.id} r={r} />)}</div>
        </>
      )}
    </section>
  );
}

/** Rate a completed job, or show (and maybe edit) the rating already given. */
export function RateJob({ b, onSaved }: { b: HomeBooking; onSaved: (s: HomeBookingReviewState) => void }) {
  const state = b.review;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(state?.review?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<HomeReviewTag[]>(state?.review?.tags ?? []);
  const [comment, setComment] = useState(state?.review?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state || (!state.review && !state.canReview)) return null;

  const showForm = (state.canReview && !state.review) || editing;
  const tagChoices = rating >= 4 ? homeReviewGoodTags : rating > 0 && rating <= 2 ? homeReviewBadTags : rating === 3 ? [...homeReviewGoodTags, ...homeReviewBadTags] : [];
  const who = b.pro?.name.split(" ")[0] ?? "the professional";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.home.submitReview(b.id, { rating, comment: comment.trim() || undefined, tags: tags.filter((t) => tagChoices.includes(t)) });
      setEditing(false);
      onSaved(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!showForm && state.review) {
    const r = state.review;
    return (
      <div className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <strong>Your rating</strong>
          {state.canEdit && <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        <Stars value={r.rating} size={22} />
        {r.comment && <p style={{ margin: 0 }}>“{r.comment}”</p>}
        {r.tags.length > 0 && <div className="review-tags">{r.tags.map((t) => <span key={t} className="tag">{homeReviewTagLabel[t]}</span>)}</div>}
        {r.hidden && <span className="muted" style={{ fontSize: 13 }}>Hidden by ZARVA: {r.hiddenReason}</span>}
        {r.rating <= 2 && <span className="muted" style={{ fontSize: 14 }}>Sorry it went badly. <a href={`/help/new?booking=${b.id}`} className="link">Tell our team what happened</a> and we'll look into it.</span>}
      </div>
    );
  }

  return (
    <div className="card stack rate-card">
      <strong>How was {who}?</strong>
      <div className="star-input" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={(hover || rating) >= n ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}
          >★</button>
        ))}
      </div>
      {tagChoices.length > 0 && (
        <div className="review-tags">
          {tagChoices.map((t) => (
            <button key={t} type="button" className={`tag tag-btn ${tags.includes(t) ? "tag-on" : ""}`} aria-pressed={tags.includes(t)}
              onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{homeReviewTagLabel[t]}</button>
          ))}
        </div>
      )}
      {rating > 0 && (
        <label>
          Anything to add? (optional)
          <textarea value={comment} maxLength={HOME_REVIEW_RULES.maxComment} rows={3} onChange={(e) => setComment(e.target.value)}
            placeholder="What went well, or what could be better" />
        </label>
      )}
      <span className="muted" style={{ fontSize: 13 }}>Your first name and last initial show with your review. Never your phone number.</span>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" disabled={busy || rating === 0} onClick={save}>{state.review ? "Save changes" : "Submit rating"}</button>
        {editing && <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </div>
  );
}

/** Landing page "What customers say": the latest real reviews with a comment. Never invented. */
export function LandingReviews() {
  const [summary, setSummary] = useState<HomeRatingSummary | null>(null);
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  useEffect(() => {
    api.home.ratingSummary().then((r) => setSummary(r.overall)).catch(() => setSummary({ average: null, count: 0, stars: [0, 0, 0, 0, 0] }));
    api.home.reviews({ withComment: true, limit: 6 }).then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
  }, []);
  return (
    <section className="lp-section">
      <div className="lp-section-head">
        <h2>What customers say</h2>
        {summary && summary.count > 0 && (
          <span className="lp-small"><RatingBadge summary={summary} /> <span className="muted">from completed jobs</span></span>
        )}
      </div>
      {reviews && reviews.length > 0 ? (
        <div className="review-grid">{reviews.map((r) => <ReviewCard key={r.id} r={r} />)}</div>
      ) : reviews ? (
        <div className="lp-placeholder">
          <p><strong>No reviews yet.</strong> Only customers whose job was completed can rate it, so reviews appear here as Durgapur starts booking. We never show made-up reviews.</p>
        </div>
      ) : null}
    </section>
  );
}
