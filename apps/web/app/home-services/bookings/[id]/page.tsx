"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPhone, homeStatusLabel, type HomeBooking } from "@zarva/core";
import { BookingSummary, StatusChip, when } from "../../../../components/BookingBits";
import { api, isSignedIn } from "../../../../lib/api";
import { payForBooking } from "../../../../lib/pay";

const LIVE_STEPS = ["confirmed", "assigned", "on_the_way", "in_progress", "completed"] as const;

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<HomeBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(() => api.home.booking(id).then((r) => setB(r.booking)), [id]);

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

      {b.pro && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>{b.pro.name}</strong>
          {b.pro.phone && <div><a href={`tel:${b.pro.phone}`}>{formatPhone(b.pro.phone)}</a></div>}
        </div>
      )}

      <h2>Address</h2>
      <div className="card">
        {b.address.name}, {formatPhone(b.address.phone)}
        <div className="muted">{[b.address.line1, b.address.line2, b.address.landmark, `${b.address.city} ${b.address.pincode}`].filter(Boolean).join(", ")}</div>
        {b.customerNote && <div style={{ marginTop: 8 }}>Note: {b.customerNote}</div>}
      </div>

      <h2>Bill</h2>
      <BookingSummary b={b} />

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
      {b.canCancel && (
        <button className="btn btn-danger" disabled={busy} style={{ marginTop: 16 }} onClick={() => {
          if (!window.confirm(b.paid ? "Cancel this booking? You'll get a full refund." : "Cancel this booking?")) return;
          void run(async () => setB((await api.home.cancel(b.id)).booking));
        }}>Cancel booking</button>
      )}
      <p style={{ marginTop: 24 }}><Link href="/home-services/bookings" className="muted">← All bookings</Link></p>
    </div>
  );
}
