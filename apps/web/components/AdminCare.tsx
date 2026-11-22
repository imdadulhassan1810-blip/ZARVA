"use client";
import { useCallback, useEffect, useState } from "react";
import {
  feedbackKindLabel, formatPhone, homeReviewTagLabel, supportStatusLabel, supportStatuses,
  type Feedback, type HomeReview, type SupportStatus, type SupportTicket,
} from "@zarva/core";
import { adminApi as api } from "../lib/api";
import { Stars } from "./Reviews";
import { TicketChip, TicketThread, fmt } from "./Support";

/** Support queue: oldest waiting first. Click a ticket to read and reply. */
export function AdminSupport() {
  const [status, setStatus] = useState<SupportStatus>("open");
  const [data, setData] = useState<{ tickets: SupportTicket[]; counts: Record<SupportStatus, number> } | null>(null);
  const [open, setOpen] = useState<SupportTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.support.admin.tickets(status).then(setData).catch((e: Error) => setError(e.message)), [status]);
  useEffect(() => { void load(); }, [load]);

  if (open) {
    return (
      <div className="stack" style={{ marginTop: 12, maxWidth: 720 }}>
        <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => { setOpen(null); void load(); }}>← All tickets</button>
        <div className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>{open.code} · {open.subject}</strong><TicketChip t={open} />
          </div>
          <span className="muted">{open.topicLabel}{open.referenceLabel ? ` · ${open.referenceLabel}` : ""}</span>
          {open.customer && (
            <span>
              Customer: <strong>{open.customer.name ?? "No name"}</strong>
              {open.customer.phone && <> · <a className="link" href={`tel:${open.customer.phone}`}>{formatPhone(open.customer.phone)}</a></>}
              {open.customer.email && <> · {open.customer.email}</>}
            </span>
          )}
          <div className="row">
            {supportStatuses.filter((s) => s !== open.status).map((s) => (
              <button key={s} className="btn btn-ghost" disabled={busy} onClick={async () => {
                setBusy(true);
                try { setOpen((await api.support.admin.setStatus(open.id, s)).ticket); } finally { setBusy(false); }
              }}>Mark “{supportStatusLabel[s]}”</button>
            ))}
          </div>
        </div>
        <TicketThread t={open} viewer="admin" busy={busy} onReply={async (m, resolve) => {
          setBusy(true);
          try { setOpen((await api.support.admin.reply(open.id, m, resolve)).ticket); } finally { setBusy(false); }
        }} />
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>The customer sees your first name and “ZARVA support”. They are not texted about replies yet; they see them in the app.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className="day-row" role="tablist" aria-label="Ticket status">
        {supportStatuses.map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={`slot ${status === s ? "slot-on" : ""}`} onClick={() => setStatus(s)}>
            {supportStatusLabel[s]}{data ? ` (${data.counts[s]})` : ""}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {data?.tickets.length === 0 && <p className="muted">No tickets here.</p>}
      {data?.tickets.map((t) => (
        <button key={t.id} className="card ticket-row" style={{ textAlign: "left", font: "inherit", cursor: "pointer" }} onClick={() => setOpen(t)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{t.code} · {t.subject}</strong><TicketChip t={t} />
          </div>
          <span className="muted" style={{ fontSize: 13 }}>{t.customer?.name ?? "Customer"} · {t.referenceLabel ?? t.topicLabel} · updated {fmt(t.updatedAt)}</span>
          <span className="ticket-last">{t.messages[t.messages.length - 1]?.body}</span>
        </button>
      ))}
    </div>
  );
}

/** Review moderation: hide abuse or personal details. Never edit what a customer wrote. */
export function AdminReviews() {
  const [filter, setFilter] = useState<"all" | "low" | "hidden">("low");
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    const q = filter === "low" ? { maxRating: 2, hidden: false } : filter === "hidden" ? { hidden: true } : {};
    return api.home.admin.reviews(q).then((r) => setReviews(r.reviews)).catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(() => { void load(); }, [load]);
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className="day-row" role="tablist" aria-label="Review filter">
        {(["low", "all", "hidden"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`slot ${filter === f ? "slot-on" : ""}`} onClick={() => setFilter(f)}>
            {f === "low" ? "1-2 stars (follow up)" : f === "all" ? "All" : "Hidden"}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {reviews?.length === 0 && <p className="muted">Nothing here.</p>}
      {reviews?.map((r) => (
        <div key={r.id} className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span><Stars value={r.rating} /> <strong style={{ marginLeft: 8 }}>{r.bookingCode}</strong> · {r.categoryName}{r.proName ? ` · ${r.proName}` : ""}</span>
            <span className="muted" style={{ fontSize: 13 }}>{fmt(r.createdAt)}</span>
          </div>
          {r.comment && <p style={{ margin: 0 }}>“{r.comment}”</p>}
          {r.tags.length > 0 && <div className="review-tags">{r.tags.map((t) => <span key={t} className="tag">{homeReviewTagLabel[t]}</span>)}</div>}
          <span className="muted" style={{ fontSize: 13 }}>By {r.customerName}{r.hidden ? ` · Hidden: ${r.hiddenReason}` : ""}</span>
          <div>
            {r.hidden
              ? <button className="btn btn-ghost" onClick={() => act(() => api.home.admin.unhideReview(r.id))}>Show again</button>
              : <button className="btn btn-danger" onClick={() => {
                const reason = window.prompt("Why hide this review? (kept for the record, the customer sees it)");
                if (reason && reason.trim().length >= 3) void act(() => api.home.admin.hideReview(r.id, reason.trim()));
              }}>Hide review</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminFeedback() {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.support.admin.feedback().then((r) => setItems(r.feedback)).catch((e: Error) => setError(e.message)); }, []);
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {error && <p className="error">{error}</p>}
      {items?.length === 0 && <p className="muted">No feedback yet.</p>}
      {items?.map((f) => (
        <div key={f.id} className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>{feedbackKindLabel[f.kind]}{f.rating ? <span style={{ marginLeft: 8 }}><Stars value={f.rating} size={14} /></span> : null}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{fmt(f.createdAt)} · {f.platform}</span>
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{f.message}</p>
          {f.customer && <span className="muted" style={{ fontSize: 13 }}>{f.customer.name ?? "No name"}{f.customer.phone ? ` · ${formatPhone(f.customer.phone)}` : ""}</span>}
        </div>
      ))}
    </div>
  );
}

/** Saves a completed booking's invoice PDF from the admin app. */
export async function adminDownloadInvoice(bookingId: string, name: string) {
  const blob = await api.home.admin.invoicePdf(bookingId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ZARVA-${name.replace(/\//g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
