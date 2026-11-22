"use client";
import { useEffect, useState } from "react";
import { DEFAULT_HOME_POLICY, formatBps, formatNotice, formatRupees, homeBillLines, homeTotals, type HomePolicy } from "@zarva/core";
import { adminApi as api } from "../lib/api";

const pct = (bps: number) => String(bps / 100);
const toBps = (s: string) => Math.round(Number(s) * 100);

/**
 * Admin: customer pricing (markup, service and platform charges), cancellation, reschedule and partner-penalty rules. Saved rules apply to every change from
 * then on; bookings already cancelled keep the refund worked out at the time.
 */
export function AdminPolicy() {
  const [p, setP] = useState<HomePolicy | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.home.admin.policy().then((r) => setP(r.policy)).catch((e: Error) => setError(e.message)); }, []);
  if (!p) return <p className="muted">{error ?? "Loading…"}</p>;

  const set = (patch: Partial<HomePolicy>) => { setSaved(null); setP({ ...p, ...patch }); };
  async function save(next: HomePolicy) {
    setBusy(true);
    setError(null);
    try {
      setP((await api.home.admin.setPolicy(next)).policy);
      setSaved("Saved. New prices apply to bookings made from now on, new rules to cancellations from now on.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0));

  return (
    <div className="stack" style={{ marginTop: 12, maxWidth: 680 }}>
      <p className="muted" style={{ margin: 0 }}>Every booking is paid online in advance. These settings decide what customers pay, what they get back when they cancel, and what partners lose when they cancel too often. Customers see them at checkout and on every booking.</p>

      <h2 style={{ marginBottom: 0 }}>Customer price</h2>
      <div className="card stack">
        <span className="muted" style={{ fontSize: 13 }}>Service prices in admin are the professional&apos;s quote, and the professional earns all of it. GST is 18% on the base price plus both charges. A booking keeps the rates it was made with.</span>
        <label>Base price = professional&apos;s quote plus this %
          <input inputMode="decimal" value={pct(p.markupBps)} onChange={(e) => set({ markupBps: toBps(e.target.value.replace(/[^\d.]/g, "")) })} />
        </label>
        <label>Service charge, % of the base price (never refunded)
          <input inputMode="decimal" value={pct(p.serviceChargeBps)} onChange={(e) => set({ serviceChargeBps: toBps(e.target.value.replace(/[^\d.]/g, "")) })} />
        </label>
        <label>Platform and maintenance charge, % of the base price (never refunded)
          <input inputMode="decimal" value={pct(p.platformChargeBps)} onChange={(e) => set({ platformChargeBps: toBps(e.target.value.replace(/[^\d.]/g, "")) })} />
        </label>
        <ExampleBill p={p} />
      </div>

      <h2 style={{ marginBottom: 0 }}>Customers</h2>
      <div className="card stack">
        <label>No cancel or reschedule less than this many minutes before the slot
          <input inputMode="numeric" value={p.customerCutoffMinutes} onChange={(e) => set({ customerCutoffMinutes: num(e.target.value) })} />
        </label>
        <label>Free reschedules per booking
          <input inputMode="numeric" value={p.maxReschedules} onChange={(e) => set({ maxReschedules: num(e.target.value) })} />
        </label>
        <strong>Refund of the service price (and its GST) by notice</strong>
        <span className="muted" style={{ fontSize: 13 }}>The service and platform charges and their GST are never refunded. If ZARVA cancels, the customer gets everything back.</span>
        {p.refundSlabs.map((s, i) => (
          <div key={i} className="price-row">
            <span style={{ flex: 1 }}>At least</span>
            <input aria-label="Hours before the slot" inputMode="decimal" style={{ width: 80 }} value={String(s.minMinutesBefore / 60)}
              onChange={(e) => set({ refundSlabs: p.refundSlabs.map((x, j) => (j === i ? { ...x, minMinutesBefore: Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 60) || 0 } : x)) })} />
            <span>hours before →</span>
            <input aria-label="Refund percent" inputMode="decimal" style={{ width: 72 }} value={pct(s.refundBps)}
              onChange={(e) => set({ refundSlabs: p.refundSlabs.map((x, j) => (j === i ? { ...x, refundBps: toBps(e.target.value.replace(/[^\d.]/g, "")) } : x)) })} />
            <span>% back</span>
            <button className="link-btn" disabled={p.refundSlabs.length <= 1} onClick={() => set({ refundSlabs: p.refundSlabs.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button className="btn btn-ghost" disabled={p.refundSlabs.length >= 8} onClick={() => set({ refundSlabs: [...p.refundSlabs, { minMinutesBefore: p.customerCutoffMinutes, refundBps: 0 }] })}>+ Add a step</button>
        <span className="muted" style={{ fontSize: 13 }}>
          Now: {p.refundSlabs.map((s) => `${formatNotice(s.minMinutesBefore)}+ → ${formatBps(s.refundBps)}`).join(" · ")}
        </span>
      </div>

      <h2 style={{ marginBottom: 0 }}>Partners</h2>
      <div className="card stack">
        <label>Cancellations a day with no penalty
          <input inputMode="numeric" value={p.partnerFreeCancelsPerDay} onChange={(e) => set({ partnerFreeCancelsPerDay: num(e.target.value) })} />
        </label>
        <label>Most cancellations a week (Monday to Sunday). After this the partner app blocks cancelling.
          <input inputMode="numeric" value={p.partnerMaxCancelsPerWeek} onChange={(e) => set({ partnerMaxCancelsPerWeek: num(e.target.value) })} />
        </label>
        <strong>Penalty on that day&apos;s earnings, taken off the weekly payout</strong>
        {p.partnerPenaltyTiers.map((t, i) => (
          <div key={i} className="price-row">
            <span style={{ flex: 1 }}>From</span>
            <input aria-label="Cancellations in a day" inputMode="numeric" style={{ width: 64 }} value={t.fromCount}
              onChange={(e) => set({ partnerPenaltyTiers: p.partnerPenaltyTiers.map((x, j) => (j === i ? { ...x, fromCount: num(e.target.value) } : x)) })} />
            <span>cancellations a day →</span>
            <input aria-label="Penalty percent" inputMode="decimal" style={{ width: 72 }} value={pct(t.penaltyBps)}
              onChange={(e) => set({ partnerPenaltyTiers: p.partnerPenaltyTiers.map((x, j) => (j === i ? { ...x, penaltyBps: toBps(e.target.value.replace(/[^\d.]/g, "")) } : x)) })} />
            <span>%</span>
            <button className="link-btn" onClick={() => set({ partnerPenaltyTiers: p.partnerPenaltyTiers.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button className="btn btn-ghost" disabled={p.partnerPenaltyTiers.length >= 8} onClick={() => set({ partnerPenaltyTiers: [...p.partnerPenaltyTiers, { fromCount: p.partnerFreeCancelsPerDay + 1 + p.partnerPenaltyTiers.length, penaltyBps: 1500 }] })}>+ Add a tier</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="banner-ok">{saved}</p>}
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => void save(p)}>{busy ? "Saving…" : "Save rules"}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => { setSaved(null); setP(DEFAULT_HOME_POLICY); }}>Reset to defaults</button>
      </div>
    </div>
  );
}

/** Live example so the admin sees what a ₹1,000 quote costs the customer with the rates on screen. */
function ExampleBill({ p }: { p: HomePolicy }) {
  const t = homeTotals([{ unitPricePaise: 100_000, qty: 1 }], p);
  return (
    <div className="stack" style={{ gap: 2, fontSize: 14 }}>
      <strong>Example: professional quotes {formatRupees(100_000)}</strong>
      {homeBillLines(t).map((l) => <div key={l.key} className="sum-row"><span>{l.label}</span><span>{formatRupees(l.paise)}</span></div>)}
      <div className="sum-row total"><span>Customer pays</span><span>{formatRupees(t.totalPaise)}</span></div>
      <div className="sum-row muted"><span>Professional earns</span><span>{formatRupees(t.pricing.quotePaise)}</span></div>
    </div>
  );
}
