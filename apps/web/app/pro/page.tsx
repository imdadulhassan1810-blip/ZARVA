"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatBps, formatPhone, formatRupees, type HomeBooking, type HomePartnerCancelStats, type HomeCategory, type HomeEarnings, type HomePro, type HomeRatingSummary, type HomeReview } from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../components/BookingBits";
import { BalanceCard, LedgerList, PayoutChip } from "../../components/Ledger";
import { Payout, ProOnboarding } from "../../components/ProOnboarding";
import { isSignedIn, partnerApi as api } from "../../lib/api";
import { areaLogin, loginUrl, signOut } from "../../lib/roles";
import { ReviewCard, StarBars, Stars } from "../../components/Reviews";
import { PartnerCancelBanner } from "../../components/CancellationRules";

/** Service professional's screen. Built mobile-first: pros use it on their phone between jobs. */
export default function Pro() {
  const router = useRouter();
  const [pro, setPro] = useState<HomePro | null | undefined>(undefined);
  const [cats, setCats] = useState<HomeCategory[]>([]);
  const [jobs, setJobs] = useState<{ available: HomeBooking[]; mine: HomeBooking[] }>({ available: [], mine: [] });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"jobs" | "earnings" | "profile">("jobs");
  const [stats, setStats] = useState<HomePartnerCancelStats | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const loadJobs = useCallback(async () => {
    setJobs(await api.home.proJobs());
    setStats((await api.home.proCancelStats()).cancelStats);
  }, []);

  useEffect(() => {
    if (!isSignedIn("partner")) return router.replace(loginUrl("partner"));
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
    api.home.proMe().then((r) => {
      setPro(r.pro);
      if (r.pro?.status === "active") void loadJobs().catch((e: Error) => setError(e.message));
    }).catch(() => router.replace(loginUrl("partner")));
  }, [loadJobs, router]);

  useEffect(() => {
    if (pro?.status !== "active") return;
    const t = setInterval(() => void loadJobs().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [pro, loadJobs]);

  async function out() {
    await signOut("partner");
    router.replace(areaLogin.partner);
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await loadJobs(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (pro === undefined) return <p className="muted">Loading…</p>;
  if (pro === null || pro.status === "draft" || pro.status === "rejected" || pro.status === "pending") {
    return (
      <>
        <ProOnboarding pro={pro} cats={cats} onChange={setPro} />
        <p style={{ textAlign: "center", marginTop: 24 }}><button className="link-btn" onClick={() => void out()}>Sign out</button></p>
      </>
    );
  }
  if (pro.status === "suspended") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1>Hi {pro.name}</h1>
        <div className="card">Your profile is suspended. Please call ZARVA partner support.</div>
        <p><button className="link-btn" onClick={() => void out()}>Sign out</button></p>
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
    <div className="partner-app" style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>{tab === "jobs" ? `Hi ${pro.name.split(" ")[0]}` : tab === "earnings" ? "Earnings" : "Profile"}</h1>
      {tab === "jobs" && <p className="muted" style={{ marginTop: 0 }}>{pro.locality ?? "Durgapur"} · {pro.jobsDone} jobs done</p>}
      {/* The partner app's own menu: nothing from the customer app here. */}
      <nav className="tabbar" role="tablist" aria-label="Partner menu">
        {(["jobs", "earnings", "profile"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            <span aria-hidden>{t === "jobs" ? "🧰" : t === "earnings" ? "₹" : "👤"}</span>{t === "jobs" ? "Jobs" : t === "earnings" ? "Earnings" : "Profile"}
          </button>
        ))}
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {tab === "earnings" ? <Earnings /> : tab === "profile" ? <Profile pro={pro} cats={cats} onPro={setPro} onSignOut={out} /> : <>

      {stats && <div style={{ marginTop: 12 }}><PartnerCancelBanner s={stats} /></div>}
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
            {(b.status === "assigned" || b.status === "on_the_way") && stats && (cancelling === b.id ? (
              <div className="card stack" style={{ borderColor: "var(--z-warning)" }}>
                <strong>Cancel this job?</strong>
                <span style={{ fontSize: 14 }}>
                  It goes back to other partners. This will be cancellation {stats.today + 1} today and {stats.week + 1} this week
                  (limits: {stats.freePerDay} a day free, {stats.maxPerWeek} a week).
                  {stats.nextPenaltyBps > 0 && <strong> {formatBps(stats.nextPenaltyBps)} of today's earnings will be deducted from your weekly payout.</strong>}
                </span>
                <label>Reason
                  <input value={cancelReason} maxLength={200} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Bike broke down" />
                </label>
                <div className="row">
                  <button className="btn btn-danger" disabled={busy || cancelReason.trim().length < 3} onClick={() => run(async () => {
                    setStats((await api.home.proCancel(b.id, cancelReason.trim())).cancelStats);
                    setCancelling(null);
                    setCancelReason("");
                  })}>Yes, cancel job</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setCancelling(null)}>Keep job</button>
                </div>
              </div>
            ) : (
              <button className="link-btn" style={{ alignSelf: "flex-start" }} disabled={busy || !stats.canCancel} onClick={() => { setCancelling(b.id); setCancelReason(""); }}>
                {stats.canCancel ? "Can't make it? Cancel job" : "Weekly cancellation limit reached"}
              </button>
            ))}
          </div>
        ))}
      </div>

      <h2>New jobs near you</h2>
      <div className="stack">
        {jobs.available.length === 0 && <p className="muted">No open jobs right now. This list refreshes every 30 seconds.</p>}
        {jobs.available.map((b) => (
          <div key={b.id} className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{when(b)}</strong><strong title="What you earn">You earn {formatRupees(b.proEarningPaise ?? b.totalPaise)}</strong>
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

function Earnings() {
  const [e, setE] = useState<HomeEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.home.proEarnings().then(setE).catch((x: Error) => setError(x.message)); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!e) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <BalanceCard e={e} />
      {e.penaltiesWeekPaise > 0 && (
        <p className="card error" style={{ margin: 0 }}>Cancellation penalties in the last 7 days: {formatRupees(e.penaltiesWeekPaise)}, already taken off your balance. Cancelling more than {e.cancelStats.freePerDay} jobs in a day costs a share of that day's earnings.</p>
      )}
      <PartnerCancelBanner s={e.cancelStats} />
      {e.balancePaise < 0 && <p className="muted" style={{ margin: 0 }}>This is commission on jobs where you collected cash. It is taken from your next online-paid jobs, or you can pay it to ZARVA by UPI.</p>}
      <h2 style={{ marginBottom: 0 }}>Payouts</h2>
      <div className="card stack">
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

/** The partner's own details: work, area, where the money goes. Separate from any customer profile. */
function Profile({ pro, cats, onPro, onSignOut }: { pro: HomePro; cats: HomeCategory[]; onPro: (p: HomePro) => void; onSignOut: () => void }) {
  const [editPayout, setEditPayout] = useState(false);
  const work = pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div className="stack">
      <div className="card stack">
        <div className="sum-row"><span className="muted">Name</span><strong>{pro.name}</strong></div>
        {pro.phone && <div className="sum-row"><span className="muted">Mobile</span><span>{formatPhone(pro.phone)}</span></div>}
        <div className="sum-row"><span className="muted">Work</span><span>{work || "-"}</span></div>
        <div className="sum-row"><span className="muted">Area</span><span>{pro.locality ?? "Durgapur"}</span></div>
        <div className="sum-row"><span className="muted">Jobs done</span><span>{pro.jobsDone}</span></div>
      </div>
      <h2 style={{ marginBottom: 0 }}>Your ratings</h2>
      <ProRatings />
      <h2 style={{ marginBottom: 0 }}>Payout account</h2>
      <div className="card stack">
        <div className="sum-row">
          <span>Paid to <strong>{pro.payout.upi ?? pro.payout.bankAccountMasked ?? "not set"}</strong></span>
          <button className="btn btn-ghost" onClick={() => setEditPayout(!editPayout)}>{editPayout ? "Close" : "Change"}</button>
        </div>
        {editPayout && <Payout pro={pro} submitLabel="Save payout account" onSaved={(p) => { onPro(p); setEditPayout(false); }} />}
      </div>
      <p className="muted" style={{ margin: 0 }}>To change your work or area, call ZARVA partner support.</p>
      <button className="btn btn-ghost" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

/** What customers said about this pro. Read-only: pros can't reply to or remove reviews. */
function ProRatings() {
  const [data, setData] = useState<{ summary: HomeRatingSummary; reviews: HomeReview[] } | null>(null);
  useEffect(() => { api.home.proReviews().then(setData).catch(() => {}); }, []);
  if (!data) return <p className="muted">Loading…</p>;
  if (data.summary.count === 0) return <p className="card muted" style={{ margin: 0 }}>No ratings yet. Customers can rate you after each completed job.</p>;
  return (
    <div className="stack">
      <div className="card rating-overview">
        <div>
          <div className="rating-big">{data.summary.average!.toFixed(1)}</div>
          <Stars value={data.summary.average!} />
          <div className="muted" style={{ fontSize: 13 }}>{data.summary.count} rating{data.summary.count === 1 ? "" : "s"}</div>
        </div>
        <StarBars summary={data.summary} />
      </div>
      {data.reviews.map((r) => <ReviewCard key={r.id} r={r} />)}
    </div>
  );
}
