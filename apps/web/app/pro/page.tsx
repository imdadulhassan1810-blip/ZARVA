"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPhone, formatRupees, type HomeBooking, type HomeCategory, type HomeEarnings, type HomePro } from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../components/BookingBits";
import { BalanceCard, LedgerList, PayoutChip } from "../../components/Ledger";
import { Payout, ProOnboarding } from "../../components/ProOnboarding";
import { api, isSignedIn } from "../../lib/api";

/** Service professional's screen. Built mobile-first: pros use it on their phone between jobs. */
export default function Pro() {
  const router = useRouter();
  const [pro, setPro] = useState<HomePro | null | undefined>(undefined);
  const [cats, setCats] = useState<HomeCategory[]>([]);
  const [jobs, setJobs] = useState<{ available: HomeBooking[]; mine: HomeBooking[] }>({ available: [], mine: [] });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"jobs" | "earnings">("jobs");

  const loadJobs = useCallback(async () => setJobs(await api.home.proJobs()), []);

  useEffect(() => {
    if (!isSignedIn()) return router.replace("/login?next=/pro");
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
    api.home.proMe().then((r) => {
      setPro(r.pro);
      if (r.pro?.status === "active") void loadJobs().catch((e: Error) => setError(e.message));
    }).catch(() => router.replace("/login?next=/pro"));
  }, [loadJobs, router]);

  useEffect(() => {
    if (pro?.status !== "active") return;
    const t = setInterval(() => void loadJobs().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [pro, loadJobs]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await loadJobs(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (pro === undefined) return <p className="muted">Loading…</p>;
  if (pro === null || pro.status === "draft" || pro.status === "rejected" || pro.status === "pending") {
    return <ProOnboarding pro={pro} cats={cats} onChange={setPro} />;
  }
  if (pro.status === "suspended") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1>Hi {pro.name}</h1>
        <div className="card">Your profile is suspended. Please call ZARVA partner support.</div>
      </div>
    );
  }

  const next = (b: HomeBooking) => {
    if (b.status === "assigned") return <button className="btn" disabled={busy} onClick={() => run(() => api.home.proStatus(b.id, "on_the_way"))}>I'm on the way</button>;
    if (b.status === "on_the_way") return (
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label>Customer's 4-digit code
          <input inputMode="numeric" maxLength={4} value={codes[b.id] ?? ""} onChange={(e) => setCodes({ ...codes, [b.id]: e.target.value.replace(/\D/g, "") })} />
        </label>
        <button className="btn" disabled={busy || (codes[b.id] ?? "").length !== 4} onClick={() => run(() => api.home.proStatus(b.id, "in_progress", codes[b.id]))}>Start job</button>
      </div>
    );
    if (b.status === "in_progress") return (
      <button className="btn" disabled={busy} onClick={() => {
        if (b.payMode === "after_service" && !window.confirm(`Collected ${formatRupees(b.totalPaise)} from the customer?`)) return;
        void run(() => api.home.proStatus(b.id, "completed"));
      }}>{b.payMode === "after_service" ? `Collected ${formatRupees(b.totalPaise)} · Complete` : "Mark complete"}</button>
    );
    return null;
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto 64px" }}>
      <h1>Partner</h1>
      <p className="muted" style={{ marginTop: 0 }}>{pro.name} · {pro.locality ?? "Durgapur"} · {pro.jobsDone} jobs done</p>
      <div className="segmented" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" aria-selected={tab === "jobs"} className={tab === "jobs" ? "on" : ""} onClick={() => setTab("jobs")}>Jobs</button>
        <button role="tab" aria-selected={tab === "earnings"} className={tab === "earnings" ? "on" : ""} onClick={() => setTab("earnings")}>Earnings</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {tab === "earnings" ? <Earnings pro={pro} onPro={setPro} /> : <>

      <h2>Your jobs</h2>
      <div className="stack">
        {jobs.mine.length === 0 && <p className="muted">No jobs yet. Accept one below.</p>}
        {jobs.mine.map((b) => (
          <div key={b.id} className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{when(b)}</strong><StatusChip b={b} />
            </div>
            <div>{itemsLine(b)}</div>
            <div>
              {b.address.name} · <a href={`tel:${b.address.phone}`}>{formatPhone(b.address.phone)}</a>
              <div className="muted">{[b.address.line1, b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</div>
              <a className="muted" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.address.line1, b.address.line2, b.address.city, b.address.pincode].filter(Boolean).join(", "))}`}>Open in Maps</a>
            </div>
            {b.customerNote && <div>Note: {b.customerNote}</div>}
            <div className="muted">{b.payMode === "after_service" ? `Collect ${formatRupees(b.totalPaise)}` : "Paid online, collect nothing"}</div>
            {next(b)}
          </div>
        ))}
      </div>

      <h2>New jobs near you</h2>
      <div className="stack">
        {jobs.available.length === 0 && <p className="muted">No open jobs right now. This list refreshes every 30 seconds.</p>}
        {jobs.available.map((b) => (
          <div key={b.id} className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{when(b)}</strong><strong>{formatRupees(b.totalPaise)}</strong>
            </div>
            <div>{itemsLine(b)}</div>
            <div className="muted">{[b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</div>
            <button className="btn" disabled={busy} onClick={() => run(() => api.home.proAccept(b.id))}>Accept job</button>
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}

function Earnings({ pro, onPro }: { pro: HomePro; onPro: (p: HomePro) => void }) {
  const [e, setE] = useState<HomeEarnings | null>(null);
  const [editPayout, setEditPayout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.home.proEarnings().then(setE).catch((x: Error) => setError(x.message)); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!e) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <BalanceCard e={e} />
      {e.balancePaise < 0 && <p className="muted" style={{ margin: 0 }}>This is commission on jobs where you collected cash. It is taken from your next online-paid jobs, or you can pay it to ZARVA by UPI.</p>}
      <h2 style={{ marginBottom: 0 }}>Payouts</h2>
      <div className="card stack">
        <div className="sum-row">
          <span>Paid to <strong>{pro.payout.upi ?? pro.payout.bankAccountMasked ?? "not set"}</strong></span>
          <button className="btn btn-ghost" onClick={() => setEditPayout(!editPayout)}>{editPayout ? "Close" : "Change"}</button>
        </div>
        {editPayout && <Payout pro={pro} submitLabel="Save payout account" onSaved={(p) => { onPro(p); setEditPayout(false); }} />}
        {e.payouts.length === 0 && <span className="muted">No payouts yet. ZARVA pays your balance every week.</span>}
        {e.payouts.map((p) => (
          <div key={p.id} className="sum-row">
            <span>{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {p.destination}{p.utr ? ` · Ref ${p.utr}` : ""}</span>
            <span><strong>{formatRupees(p.amountPaise)}</strong> <PayoutChip p={p} /></span>
          </div>
        ))}
      </div>
      <h2 style={{ marginBottom: 0 }}>History</h2>
      <LedgerList entries={e.entries} />
    </div>
  );
}
