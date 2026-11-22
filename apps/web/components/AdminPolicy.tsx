"use client";
import { useEffect, useState } from "react";
import { DEFAULT_HOME_POLICY, formatBps, formatNotice, type HomePolicy } from "@zarva/core";
import { adminApi as api } from "../lib/api";

const pct = (bps: number) => String(bps / 100);
const toBps = (s: string) => Math.round(Number(s) * 100);

/**
 * Admin: cancellation, reschedule and partner-penalty rules. Saved rules apply to every change from
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
      setSaved("Saved. New rules apply to cancellations from now on.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0));

  return (
    <div className="stack" style={{ marginTop: 12, maxWidth: 680 }}>
      <p className="muted" style={{ margin: 0 }}>Every booking is paid online in advance. These rules decide what customers get back when they cancel, and what partners lose when they cancel too often. Customers see them at checkout and on every booking.</p>

      <h2 style={{ marginBottom: 0 }}>Customers</h2>
      <div className="card stack">
        <label>No cancel or reschedule less than this many minutes before the slot
          <input inputMode="numeric" value={p.customerCutoffMinutes} onChange={(e) => set({ customerCutoffMinutes: num(e.target.value) })} />
        </label>
        <label>Free reschedules per booking
          <input inputMode="numeric" value={p.maxReschedules} onChange={(e) => set({ maxReschedules: num(e.target.value) })} />
        </label>
        <strong>Refund of the service price (and its GST) by notice</strong>
        <span className="muted" style={{ fontSize: 13 }}>The convenience fee is never refunded. If ZARVA cancels, the customer gets everything back.</span>
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
