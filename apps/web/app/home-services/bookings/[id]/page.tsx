"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPhone, formatRupees, homeStatusLabel, type HomeBooking, type HomePolicy } from "@zarva/core";
import { BookingChanges, CustomerRules } from "../../../../components/CancellationRules";
import { BookingSummary, StatusChip, when } from "../../../../components/BookingBits";
import { api, isSignedIn } from "../../../../lib/api";
import { payForBooking } from "../../../../lib/pay";
import { RateJob, RatingBadge } from "../../../../components/Reviews";

/** Saves the invoice PDF (the API checks the booking is this customer's). */
async function downloadInvoice(b: HomeBooking) {
  const blob = await api.home.invoicePdf(b.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ZARVA-${(b.invoiceNumber ?? b.code).replace(/\//g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const LIVE_STEPS = ["confirmed", "assigned", "on_the_way", "in_progress", "completed"] as const;

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<HomeBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [policy, setPolicy] = useState<HomePolicy | null>(null);

  const load = useCallback(() => api.home.booking(id).then((r) => setB(r.booking)), [id]);
  const cityId = b?.cityId;
  useEffect(() => {
    if (cityId) api.home.catalog(cityId).then((r) => setPolicy(r.policy ?? null)).catch(() => {});
  }, [cityId]);

  useEffect(() => {
    if (!isSignedIn()) return router.replace(`/login?next=/home-services/bookings/${id}`);
    const q = new URLSearchParams(window.location.search);
    setIsNew(q.has("new"));
    if (q.get("payError")) setError(q.get("payError"));
    load().catch((e: Error) => setError(e.message));
    // Light polling so the customer sees "on the way" without refreshing. Push notifications come later.
    const t = setInterval(() => void load().catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [id, load, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!b) return <p className="muted">{error ?? "Loading…"}</p>;
  const stepIdx = LIVE_STEPS.indexOf(b.status as (typeof LIVE_STEPS)[number]);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto 64px" }}>
      {isNew && b.status === "confirmed" && <div className="banner-ok">Booked! We'll assign a professional shortly.</div>}
      <h1 style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{b.categoryName} <StatusChip b={b} /></h1>
      <p className="muted" style={{ marginTop: 0 }}>Booking {b.code} · {when(b)}</p>

      {b.status === "pending_payment" && (
        <div className="card stack" style={{ borderColor: "var(--z-warning)" }}>
          <strong>Payment pending</strong>
          <span className="muted">Your slot is held for 15 minutes. Pay to confirm.</span>
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            const r = await api.home.pay(b.id);
            setB(await payForBooking(b.id, r.payment));
          })}>Pay now</button>
        </div>
      )}

      {stepIdx >= 0 && (
        <ol className="steps">
          {LIVE_STEPS.map((s, i) => <li key={s} className={i <= stepIdx ? "done" : ""}>{homeStatusLabel[s]}</li>)}
        </ol>
      )}

      {b.startCode && ["confirmed", "assigned", "on_the_way"].includes(b.status) && (
        <div className="card start-code">
          <span>Share this code with the professional when they arrive</span>
          <strong aria-label={`Start code ${b.startCode.split("").join(" ")}`}>{b.startCode}</strong>
        </div>
      )}

      {b.status === "completed" && b.review && (
        <div style={{ marginTop: 16 }}>
          <RateJob b={b} onSaved={(review) => setB({ ...b, review })} />
        </div>
      )}

      {b.pro && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>{b.pro.name}</strong> <RatingBadge summary={b.pro.rating} />
          {b.pro.phone && <div><a href={`tel:${b.pro.phone}`}>{formatPhone(b.pro.phone)}</a></div>}
        </div>
      )}

      {/* Near the top, so the customer finds it without scrolling past the bill and timeline. */}
      <BookingChanges b={b} policy={policy} onChange={setB} />

      <h2>Address</h2>
      <div className="card">
        {b.address.name}, {formatPhone(b.address.phone)}
        <div className="muted">{[b.address.line1, b.address.line2, b.address.landmark, `${b.address.city} ${b.address.pincode}`].filter(Boolean).join(", ")}</div>
        {b.customerNote && <div style={{ marginTop: 8 }}>Note: {b.customerNote}</div>}
      </div>

      <h2>Bill</h2>
      <BookingSummary b={b} />
      {b.hasInvoice && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => {
            await downloadInvoice(b);
            if (!b.invoiceNumber) await load();
          })}>⬇ Download invoice (PDF)</button>
          {b.invoiceNumber && <span className="muted" style={{ fontSize: 13 }}>Invoice {b.invoiceNumber}</span>}
        </div>
      )}

      <h2>Timeline</h2>
      <ul className="timeline">
        {b.events.map((e, i) => (
          <li key={i}>
            <strong>{homeStatusLabel[e.status]}</strong>
            {e.note && <span> · {e.note}</span>}
            <div className="muted" style={{ fontSize: 13 }}>{new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</div>
          </li>
        ))}
      </ul>

      {error && <p className="error" role="alert">{error}</p>}
      {b.cancellation && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <strong>Refund</strong>
          <span>
            {b.cancellation.by === "customer"
              ? `Cancelled ${Math.floor(b.cancellation.minutesBefore / 60)} h ${b.cancellation.minutesBefore % 60} min before the slot.`
              : "Cancelled by ZARVA, so everything you paid comes back."}
            {" "}Refund {formatRupees(b.cancellation.quote.refundPaise)}
            {b.cancellation.quote.chargePaise > 0 ? `, cancellation charge ${formatRupees(b.cancellation.quote.chargePaise)}` : ""}.
          </span>
        </div>
      )}
      {policy && ["pending_payment", "confirmed", "assigned"].includes(b.status) && <div style={{ marginTop: 16 }}><CustomerRules policy={policy} /></div>}
      <div className="card help-strip">
        <span><strong>Need help with this booking?</strong> <span className="muted">Our team replies here in the app.</span></span>
        <Link className="btn btn-ghost" href={`/help/new?booking=${b.id}`}>Get help</Link>
      </div>
      <p style={{ marginTop: 24 }}><Link href="/home-services/bookings" className="muted">← All bookings</Link></p>
    </div>
  );
}
