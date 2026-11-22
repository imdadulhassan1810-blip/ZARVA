"use client";
import { useEffect, useState } from "react";
import {
  formatBps, formatNotice, formatRupees, homeChangeBlockText, refundSlabLines,
  type HomeBooking, type HomeCancelInfo, type HomePolicy, type HomeRefundQuote, type HomeSlotDay,
} from "@zarva/core";
import { api } from "../lib/api";

/** The customer rules in plain words: shown at checkout and on the booking page. */
export function CustomerRules({ policy, compact = false }: { policy: HomePolicy; compact?: boolean }) {
  const cutoff = formatNotice(policy.customerCutoffMinutes);
  return (
    <div className="card stack rules" style={{ fontSize: 14 }}>
      <strong>Cancellation and reschedule</strong>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Reschedule for free, up to {policy.maxReschedules} times, until {cutoff} before your slot.</li>
        <li>Cancel until {cutoff} before your slot. Your refund depends on how early you cancel:</li>
        {!compact && (
          <ul style={{ paddingLeft: 18 }}>
            {refundSlabLines(policy).map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <li>The GST on the service price is refunded in the same share. The service charge, the platform and maintenance charge, and the GST on them are not refunded.</li>
        <li>Less than {cutoff} before the slot, the booking can't be cancelled or moved.</li>
      </ul>
    </div>
  );
}

/** Line-by-line refund, so the customer sees exactly what they get and what is kept. */
export function RefundBreakdown({ q }: { q: HomeRefundQuote }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="sum-row"><span>Service price · {formatBps(q.refundBps)} back</span><span>{formatRupees(q.baseRefundPaise)}</span></div>
      <div className="sum-row"><span>GST on it · {formatBps(q.refundBps)} back</span><span>{formatRupees(q.gstRefundPaise)}</span></div>
      {q.feeKeptPaise > 0 && <div className="sum-row muted"><span>Service &amp; platform charges and their GST {formatRupees(q.feeKeptPaise)} · not refunded</span><span>{formatRupees(0)}</span></div>}
      <div className="sum-row total"><span>You get back</span><span>{formatRupees(q.refundPaise)}</span></div>
      <div className="sum-row muted"><span>Cancellation charge</span><span>{formatRupees(q.chargePaise)}</span></div>
    </div>
  );
}

const deadlineText = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Cancel and reschedule on the customer's booking page. Buttons stay visible but switched off
 * with the reason when the rules don't allow a change, so the customer knows why.
 */
export function BookingChanges({ b, policy, onChange }: { b: HomeBooking; policy: HomePolicy | null; onChange: (b: HomeBooking) => void }) {
  const [mode, setMode] = useState<"none" | "cancel" | "reschedule">("none");
  const [info, setInfo] = useState<HomeCancelInfo | null>(b.cancelInfo ?? null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<HomeSlotDay[]>([]);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setInfo(b.cancelInfo ?? null), [b]);
  const ci = info;
  if (!ci || !["pending_payment", "confirmed", "assigned"].includes(b.status)) return null;

  async function openCancel() {
    setError(null);
    setMode("cancel");
    // Fresh quote: the refund steps down as the slot gets closer.
    try { setInfo((await api.home.cancelQuote(b.id)).cancelInfo); } catch (e) { setError((e as Error).message); }
  }
  async function openReschedule() {
    setError(null);
    setMode("reschedule");
    setSlot(null);
    try {
      const r = await api.home.slots(b.cityId, b.categoryId);
      setDays(r.days);
      const first = r.days.findIndex((d) => d.slots.some((s) => s.available && s.start !== b.slotStart));
      setDay(first < 0 ? 0 : first);
    } catch (e) { setError((e as Error).message); }
  }
  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      onChange((await api.home.cancel(b.id, reason.trim() || undefined, ci?.quote?.refundPaise)).booking);
      setMode("none");
    } catch (e) {
      const err = e as Error & { code?: string };
      // The refund stepped down while the customer read it: show the new figure and let them confirm again.
      if (err.code === "quote_changed") setInfo((await api.home.cancelQuote(b.id)).cancelInfo);
      setError(err.message);
    } finally { setBusy(false); }
  }
  async function confirmReschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await api.home.reschedule(b.id, slot)).booking);
      setMode("none");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const unpaid = b.status === "pending_payment";
  const blockText = (k: HomeCancelInfo["cancelBlock"]) => (k && policy ? homeChangeBlockText[k](policy) : null);

  return (
    <div className="card stack" style={{ marginTop: 16 }}>
      <strong>Need to change this booking?</strong>
      {!unpaid && (ci.canCancel || ci.canReschedule) && (
        <span className="muted" style={{ fontSize: 14 }}>You can cancel or reschedule until {deadlineText(ci.changeDeadline)}.</span>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {!unpaid && (
          <button className="btn btn-ghost" disabled={!ci.canReschedule || busy} onClick={openReschedule}>
            Reschedule (free{ci.reschedulesLeft > 0 ? `, ${ci.reschedulesLeft} left` : ""})
          </button>
        )}
        <button className="btn btn-danger" disabled={!ci.canCancel || busy} onClick={openCancel}>Cancel booking</button>
      </div>
      {!ci.canCancel && <p className="muted" style={{ fontSize: 14, margin: 0 }}>{blockText(ci.cancelBlock)}</p>}
      {ci.canCancel && !ci.canReschedule && !unpaid && <p className="muted" style={{ fontSize: 14, margin: 0 }}>{blockText(ci.rescheduleBlock)}</p>}

      {mode === "cancel" && (
        <div className="card stack" style={{ borderColor: "var(--z-danger, #c0392b)" }}>
          <strong>Cancel booking {b.code}?</strong>
          {ci.quote ? <RefundBreakdown q={ci.quote} /> : <span className="muted">Nothing was paid, so there is nothing to refund.</span>}
          {ci.quote && <span className="muted" style={{ fontSize: 13 }}>Refunds reach your bank or UPI app in 5-7 working days.</span>}
          <label>
            Reason (optional)
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Plans changed" />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-danger" disabled={busy || !ci.canCancel} onClick={confirmCancel}>
              {busy ? "Cancelling…" : ci.quote ? `Cancel and get ${formatRupees(ci.quote.refundPaise)} back` : "Cancel booking"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode("none")}>Keep booking</button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="card stack">
          <strong>Pick a new time</strong>
          <span className="muted" style={{ fontSize: 14 }}>Free. Your price stays the same. We'll find a professional for the new time.</span>
          <div className="day-row" role="tablist">
            {days.map((d, i) => (
              <button key={d.date} role="tab" aria-selected={i === day} className={`day ${i === day ? "day-on" : ""}`} onClick={() => { setDay(i); setSlot(null); }}>{d.label}</button>
            ))}
          </div>
          <div className="slot-grid">
            {days[day]?.slots.map((s) => (
              <button key={s.start} disabled={!s.available || s.start === b.slotStart} className={`slot ${slot === s.start ? "slot-on" : ""}`} onClick={() => setSlot(s.start)}>
                {s.label}{s.start === b.slotStart ? " (current)" : ""}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn" disabled={busy || !slot} onClick={confirmReschedule}>{busy ? "Moving…" : slot ? "Move my booking" : "Pick a slot"}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode("none")}>Back</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Partner app: today's and this week's cancellations, and what the next one costs. */
export function PartnerCancelBanner({ s }: { s: { today: number; week: number; freePerDay: number; maxPerWeek: number; todayPenaltyBps: number; nextPenaltyBps: number; canCancel: boolean } }) {
  const warn = s.todayPenaltyBps > 0 || s.nextPenaltyBps > 0 || !s.canCancel;
  return (
    <div className="card stack" style={{ fontSize: 14, borderColor: warn ? "var(--z-warning)" : undefined }}>
      <strong>Your cancellations</strong>
      <span>Today: {s.today} of {s.freePerDay} free · This week: {s.week} of {s.maxPerWeek}</span>
      {!s.canCancel ? (
        <span className="error">You've reached this week's limit. You can't cancel more jobs until Monday. Call ZARVA support if you can't do a job.</span>
      ) : s.todayPenaltyBps > 0 ? (
        <span className="error">You've passed {s.freePerDay} cancellations today: {formatBps(s.todayPenaltyBps)} of today's earnings will be deducted from your weekly payout.</span>
      ) : s.nextPenaltyBps > 0 ? (
        <span>One more cancellation today and {formatBps(s.nextPenaltyBps)} of today's earnings will be deducted from your weekly payout.</span>
      ) : (
        <span className="muted">Up to {s.freePerDay} cancellations a day have no penalty. After that, a share of that day's earnings is deducted from your weekly payout.</span>
      )}
    </div>
  );
}
