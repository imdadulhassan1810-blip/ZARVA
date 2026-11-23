"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  formatPhone, formatRupees, homeBookingStatuses, homeProDocLabel, homeProIdTypeLabel, homeStatusLabel,
  type HomeAdminCategory, type HomeBooking, type HomeBookingStatus, type HomeCategory, type HomeEarnings, type HomePayout, type HomePro,
  type HomeProBalance, type HomeProDocKind, type HomeService,
} from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../components/BookingBits";
import { AdminTeam } from "../../components/AdminTeam";
import { AdminFeedback, AdminReviews, AdminSupport, adminDownloadInvoice } from "../../components/AdminCare";
import { Amount, BalanceCard, LedgerList, PayoutChip } from "../../components/Ledger";
import { adminApi as api, isSignedIn } from "../../lib/api";
import { loginUrl, signOut } from "../../lib/roles";
import { AdminPolicy } from "../../components/AdminPolicy";

type Tab = "bookings" | "support" | "reviews" | "feedback" | "pros" | "payouts" | "prices" | "rules" | "team";

/** Operations console for the ZARVA team. Access: a ZARVA-issued admin login (see /admin/login). */
export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("bookings");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<HomeBookingStatus | "">("confirmed");
  const [bookings, setBookings] = useState<HomeBooking[]>([]);
  const [pros, setPros] = useState<HomePro[]>([]);
  const [services, setServices] = useState<HomeService[]>([]);
  const [cats, setCats] = useState<HomeCategory[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [adminCats, setAdminCats] = useState<HomeAdminCategory[]>([]);
  const [commission, setCommission] = useState<Record<string, string>>({});
  const [balances, setBalances] = useState<{ pros: HomeProBalance[]; payouts: HomePayout[] }>({ pros: [], payouts: [] });
  const [alerts, setAlerts] = useState<HomeBooking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, p, s, c, pay, al] = await Promise.all([
      api.home.admin.bookings(status || undefined), api.home.admin.pros(), api.home.admin.services(),
      api.home.admin.categories(), api.home.admin.balances(), api.home.admin.alerts(),
    ]);
    setBookings(b.bookings);
    setAlerts(al.bookings);
    setPros(p.pros);
    setServices(s.services);
    setAdminCats(c.categories);
    setBalances(pay);
  }, [status]);

  useEffect(() => {
    if (!isSignedIn("admin")) return router.replace(loginUrl("admin"));
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!isSignedIn("admin")) return;
    load().then(() => setAllowed(true)).catch(async (e: Error & { status?: number }) => {
      // Session ended (12 hours, disabled, signed out elsewhere): back to the admin sign-in.
      if (e.status === 401 || e.status === 403) {
        await signOut("admin");
        router.replace(loginUrl("admin"));
      } else setError(e.message);
    });
  }, [load, router]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }

  if (allowed === null) return <p className="muted">{error ?? "Loading…"}</p>;

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
  const activePros = pros.filter((p) => p.status === "active");

  const card = (b: HomeBooking) => {
              const fit = activePros.filter((p) => p.categoryIds.includes(b.categoryId) && p.cityId === b.cityId);
              return (
                <div key={b.id} className="card stack">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{b.code} · {b.categoryName} · {when(b)}</strong><StatusChip b={b} />
                  </div>
                  <div>{itemsLine(b)} · <strong>{formatRupees(b.totalPaise)}</strong> · {b.payMode === "online" ? (b.paid ? "paid online" : "unpaid") : "pay after service"}</div>
                  {b.pricing && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Base {formatRupees(b.pricing.basePaise)} · Operations {formatRupees(b.pricing.serviceChargePaise)} · Tech {formatRupees(b.pricing.platformChargePaise)}{b.pricing.minFeeApplied ? " (minimum fee)" : ""} · GST {formatRupees(b.pricing.gstPaise)} · pro earns {formatRupees(b.pricing.proEarningPaise)}
                    </div>
                  )}
                  <div className="muted">{b.address.name}, {formatPhone(b.address.phone)} · {[b.address.line1, b.address.line2, b.address.pincode].filter(Boolean).join(", ")}</div>
                  {b.cancellation && (
                    <div className="muted">
                      Cancelled by {b.cancellation.by}, {Math.floor(b.cancellation.minutesBefore / 60)} h {b.cancellation.minutesBefore % 60} min before the slot ·
                      refund {formatRupees(b.cancellation.quote.refundPaise)} · kept {formatRupees(b.cancellation.quote.chargePaise)}
                    </div>
                  )}
                  {b.rescheduleCount > 0 && <div className="muted">Rescheduled {b.rescheduleCount}×</div>}
                  {b.dispatch?.alert && (
                    <div className="error" style={{ margin: 0 }}>
                      ⚠ {b.dispatch.alert}. Assign someone by hand, or ZARVA cancels with a full refund at {new Date(b.dispatch.autoCancelAt!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}.
                    </div>
                  )}
                  {b.pro && <div>Professional: {b.pro.name}{b.pro.phone ? ` (${formatPhone(b.pro.phone)})` : ""}</div>}
                  {b.hasInvoice && (
                    <div><button className="btn btn-ghost" onClick={() => void run(() => adminDownloadInvoice(b.id, b.invoiceNumber ?? b.code))}>⬇ Invoice{b.invoiceNumber ? ` ${b.invoiceNumber}` : ""}</button></div>
                  )}
                  {(b.status === "confirmed" || b.status === "assigned") && (
                    <div className="row">
                      <select defaultValue="" onChange={(e) => e.target.value && void run(() => api.home.admin.assign(b.id, e.target.value))}>
                        <option value="">{b.pro ? "Reassign to…" : "Assign to…"}</option>
                        {fit.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.locality ?? ""}</option>)}
                      </select>
                      {b.status === "confirmed" && !b.pro && (
                        <button className="btn btn-ghost" onClick={() => void run(() => api.home.admin.redispatch(b.id))}>Try auto-assign again</button>
                      )}
                      <button className="btn btn-danger" onClick={() => {
                        const reason = window.prompt("Reason for cancelling (the customer sees this). ZARVA cancelling refunds everything, fee included.");
                        if (reason && reason.trim().length >= 3) void run(() => api.home.admin.cancel(b.id, reason.trim()));
                      }}>Cancel booking</button>
                    </div>
                  )}
                </div>
              );
  };

  return (
    <div style={{ marginBottom: 64 }}>
      <h1>Home services admin</h1>
      <div className="day-row" role="tablist">
        {(["bookings", "support", "reviews", "feedback", "pros", "payouts", "prices", "rules", "team"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`day ${tab === t ? "day-on" : ""}`} onClick={() => setTab(t)}>
            {t === "bookings" ? `Bookings${alerts.length ? ` (${alerts.length} need a pro)` : ""}` : t === "support" ? "Support" : t === "reviews" ? "Reviews" : t === "feedback" ? "Feedback"
              : t === "pros" ? `Professionals${pros.some((p) => p.status === "pending") ? ` (${pros.filter((p) => p.status === "pending").length} to review)` : ""}`
              : t === "payouts" ? `Payouts${balances.payouts.some((p) => p.status === "manual") ? " •" : ""}` : t === "prices" ? "Service prices" : t === "rules" ? "Pricing, cancellation & auto-assign" : "Team"}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {tab === "bookings" && (
        <>
          {alerts.length > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              <h2 style={{ margin: 0 }}>Need a professional ({alerts.length})</h2>
              <p className="muted" style={{ margin: 0 }}>Auto-assign found nobody free for these. They are open for any partner to take, and ZARVA keeps trying. If still nobody close to the slot, the customer is refunded in full.</p>
              {alerts.map(card)}
            </div>
          )}
          <label style={{ maxWidth: 280, margin: "12px 0" }}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as HomeBookingStatus | "")}>
              <option value="">All</option>
              {homeBookingStatuses.map((s) => <option key={s} value={s}>{homeStatusLabel[s]}</option>)}
            </select>
          </label>
          <div className="stack">
            {bookings.length === 0 && <p className="muted">No bookings with this status.</p>}
            {bookings.map(card)}
          </div>
        </>
      )}

      {tab === "pros" && (
        <div className="stack" style={{ marginTop: 12 }}>
          {pros.length === 0 && <p className="muted">No professionals yet. They sign up at /partner.</p>}
          {pros.map((p) => <ProCard key={p.id} p={p} catName={catName} run={run} />)}
        </div>
      )}

      {tab === "payouts" && <Payouts data={balances} run={run} />}

      {tab === "team" && <AdminTeam />}
      {tab === "rules" && <AdminPolicy />}
      {tab === "support" && <AdminSupport />}
      {tab === "reviews" && <AdminReviews />}
      {tab === "feedback" && <AdminFeedback />}

      {tab === "prices" && (
        <div className="stack" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>Each price is the professional&apos;s quote, which is what the professional earns. Customers pay the quote plus the markup, the service and platform charges and GST (set them in Pricing &amp; cancellation). Commission % only applies to bookings made before 22 Nov 2026, when prices included GST.</p>
          {cats.map((c) => {
            const ac = adminCats.find((x) => x.id === c.id);
            const pct = commission[c.id] ?? (ac ? String(ac.commissionBps / 100) : "");
            return (
            <div key={c.id} className="card stack">
              <div className="price-row">
                <strong style={{ flex: 1 }}>{c.icon} {c.name}</strong>
                <span className="muted" style={{ fontSize: 14 }}>Commission %</span>
                <input aria-label={`Commission for ${c.name} in percent`} inputMode="decimal" style={{ width: 72 }} value={pct}
                  onChange={(e) => setCommission({ ...commission, [c.id]: e.target.value.replace(/[^\d.]/g, "") })} />
                <button className="btn btn-ghost" disabled={!ac || commission[c.id] === undefined || Math.round(Number(commission[c.id]) * 100) === ac.commissionBps}
                  onClick={() => run(async () => {
                    await api.home.admin.setCommission(c.id, Math.round(Number(commission[c.id]) * 100));
                    setCommission((m) => { const n = { ...m }; delete n[c.id]; return n; });
                  })}>Save</button>
              </div>
              {services.filter((s) => s.categoryId === c.id).map((s) => (
                <div key={s.id} className="price-row">
                  <span style={{ flex: 1, opacity: s.active ? 1 : 0.5 }}>{s.name}</span>
                  <input aria-label={`Price of ${s.name} in rupees`} inputMode="numeric" style={{ width: 100 }}
                    value={prices[s.id] ?? String(s.pricePaise / 100)} onChange={(e) => setPrices({ ...prices, [s.id]: e.target.value.replace(/\D/g, "") })} />
                  <button className="btn btn-ghost" disabled={!prices[s.id] || Number(prices[s.id]) * 100 === s.pricePaise}
                    onClick={() => run(async () => {
                      await api.home.admin.updateService(s.id, { pricePaise: Number(prices[s.id]) * 100 });
                      setPrices((p) => { const n = { ...p }; delete n[s.id]; return n; });
                    })}>Save</button>
                  <button className="btn btn-ghost" onClick={() => run(() => api.home.admin.updateService(s.id, { active: !s.active }))}>{s.active ? "Hide" : "Show"}</button>
                </div>
              ))}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const proTone: Record<HomePro["status"], string> = { draft: "info", pending: "warn", active: "ok", rejected: "bad", suspended: "bad" };
const proLabel: Record<HomePro["status"], string> = { draft: "Signing up", pending: "To review", active: "Active", rejected: "Sent back", suspended: "Suspended" };

/** One professional, with their KYC files viewable inline. */
function ProCard({ p, catName, run }: { p: HomePro; catName: (id: string) => string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState<{ kind: HomeProDocKind; url: string; mime: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (open) URL.revokeObjectURL(open.url); }, [open]);
  async function view(kind: HomeProDocKind) {
    setErr(null);
    if (open?.kind === kind) return setOpen(null);
    try {
      const blob = await api.home.admin.proDocument(p.id, kind);
      setOpen({ kind, url: URL.createObjectURL(blob), mime: blob.type });
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="card stack">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong>{p.name}</strong> <span className={`chip chip-${proTone[p.status]}`}>{proLabel[p.status]}</span>
          <div className="muted">{formatPhone(p.phone)} · {p.locality ?? p.cityId} · {p.experienceYears != null ? `${p.experienceYears} yrs exp · ` : ""}{p.jobsDone} jobs</div>
          <div style={{ fontSize: 14 }}>{p.categoryIds.map(catName).join(", ")}</div>
          <div className="muted" style={{ fontSize: 14 }}>
            ID: {p.idType ? homeProIdTypeLabel[p.idType] : "not chosen"} · Payout: {p.payout.upi ?? (p.payout.bankAccountMasked ? `${p.payout.bankAccountMasked} (${p.payout.ifsc})` : "not added")}
            {p.payout.accountName ? ` · in the name of ${p.payout.accountName}` : ""}
          </div>
          {p.status === "rejected" && <div className="muted" style={{ fontSize: 14 }}>Sent back: {p.rejectionReason}</div>}
          {p.status === "draft" && p.missing.length > 0 && <div className="muted" style={{ fontSize: 14 }}>Still filling in: {p.missing.join(", ")}</div>}
        </div>
        <div className="row" style={{ flex: "0 0 auto", alignItems: "flex-start" }}>
          {p.status === "pending" && <button className="btn" onClick={() => {
            if (window.confirm(`Approve ${p.name}? Check that the name and photo match the ID first.`)) void run(() => api.home.admin.setProStatus(p.id, "active"));
          }}>Approve</button>}
          {p.status === "pending" && <button className="btn btn-danger" onClick={() => {
            const reason = window.prompt("What should they fix? (they get this by SMS)", "ID photo is not clear");
            if (reason && reason.trim().length >= 5) void run(() => api.home.admin.rejectPro(p.id, reason.trim()));
          }}>Send back</button>}
          {p.status === "suspended" && <button className="btn btn-ghost" onClick={() => run(() => api.home.admin.setProStatus(p.id, "active"))}>Re-activate</button>}
          {p.status === "active" && <button className="btn btn-danger" onClick={() => run(() => api.home.admin.setProStatus(p.id, "suspended"))}>Suspend</button>}
        </div>
      </div>
      {p.documents.length > 0 && (
        <div className="kyc-docs">
          {p.documents.map((d) => (
            <button key={d.kind} className={`day ${open?.kind === d.kind ? "day-on" : ""}`} onClick={() => void view(d.kind)}>
              {homeProDocLabel[d.kind]}
            </button>
          ))}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {open && (open.mime === "application/pdf"
        ? <iframe title={homeProDocLabel[open.kind]} src={open.url} className="kyc-viewer" style={{ width: "100%", height: 420 }} />
        : <img alt={homeProDocLabel[open.kind]} src={open.url} className="kyc-viewer" />)}
    </div>
  );
}

/** Who ZARVA owes, paying them, and recording UTRs for manual UPI payouts. */
function Payouts({ data, run }: { data: { pros: HomeProBalance[]; payouts: HomePayout[] }; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [ledger, setLedger] = useState<{ proId: string; e: HomeEarnings } | null>(null);
  const [utr, setUtr] = useState<Record<string, string>>({});
  const owed = data.pros.reduce((s, p) => s + Math.max(0, p.balancePaise), 0);
  const dues = data.pros.reduce((s, p) => s + Math.min(0, p.balancePaise), 0);
  const toPay = data.payouts.filter((p) => p.status === "manual");
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className="card balance">
        <div><div className="muted" style={{ fontSize: 14 }}>ZARVA owes professionals</div><div className="big">{formatRupees(owed)}</div></div>
        <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 14 }}>Cash dues from professionals</div><div className="big" style={{ fontSize: 24 }}>{formatRupees(Math.abs(dues))}</div></div>
      </div>

      {toPay.length > 0 && (
        <>
          <h2 style={{ marginBottom: 0 }}>To pay now ({toPay.length})</h2>
          <p className="muted" style={{ margin: 0 }}>Send each amount from the business UPI app, then type the UPI reference number (UTR, 12 digits) here.</p>
          {toPay.map((p) => (
            <div key={p.id} className="card stack">
              <div className="sum-row"><strong>{p.proName}</strong><strong>{formatRupees(p.amountPaise)}</strong></div>
              <div className="muted">Pay to {p.destination}{p.note ? ` · ${p.note}` : ""}</div>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label>UPI reference (UTR)
                  <input inputMode="numeric" value={utr[p.id] ?? ""} onChange={(e) => setUtr({ ...utr, [p.id]: e.target.value.trim() })} placeholder="e.g. 432112345678" />
                </label>
                <button className="btn" disabled={(utr[p.id] ?? "").length < 6} onClick={() => run(() => api.home.admin.markPayoutPaid(p.id, utr[p.id]!))}>Mark paid</button>
                <button className="btn btn-danger" onClick={() => {
                  const reason = window.prompt("Why didn't it go through? The amount goes back to their balance.");
                  if (reason && reason.trim().length >= 3) void run(() => api.home.admin.markPayoutFailed(p.id, reason.trim()));
                }}>Couldn&apos;t pay</button>
              </div>
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginBottom: 0 }}>Balances</h2>
      {data.pros.length === 0 && <p className="muted">No approved professionals yet.</p>}
      {data.pros.map((p) => (
        <div key={p.proId} className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <strong>{p.name}</strong> <span className="muted">{formatPhone(p.phone)}</span>
              <div className="muted" style={{ fontSize: 14 }}>{p.destination ?? "No payout account yet"}{p.lastPayoutAt ? ` · last paid ${new Date(p.lastPayoutAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Amount paise={p.balancePaise} />
              {p.balancePaise >= 10000 && p.payoutReady && (
                <button className="btn" onClick={() => {
                  const v = window.prompt(`Pay ${p.name} how much (₹)?`, String(Math.floor(p.balancePaise / 100)));
                  const paise = v ? Math.round(Number(v) * 100) : 0;
                  if (paise > 0) void run(() => api.home.admin.createPayout(p.proId, paise, "Weekly payout"));
                }}>Pay</button>
              )}
              <button className="btn btn-ghost" onClick={() => {
                const v = window.prompt("Adjustment in ₹. Use a minus sign to deduct. Example: 250 for cash dues received, -100 for a penalty.");
                const paise = v ? Math.round(Number(v) * 100) : 0;
                if (!paise || Number.isNaN(paise)) return;
                const note = window.prompt("Reason (the professional sees this)");
                if (note && note.trim().length >= 3) void run(() => api.home.admin.adjust(p.proId, paise, note.trim()));
              }}>Adjust</button>
              <button className="btn btn-ghost" onClick={async () => {
                if (ledger?.proId === p.proId) return setLedger(null);
                setLedger({ proId: p.proId, e: await api.home.admin.ledger(p.proId) });
              }}>{ledger?.proId === p.proId ? "Hide" : "History"}</button>
            </div>
          </div>
          {ledger?.proId === p.proId && <><BalanceCard e={ledger.e} who="pro" /><LedgerList entries={ledger.e.entries} /></>}
        </div>
      ))}

      <h2 style={{ marginBottom: 0 }}>Recent payouts</h2>
      {data.payouts.length === 0 && <p className="muted">No payouts yet.</p>}
      {data.payouts.length > 0 && (
        <div className="card ledger">
          {data.payouts.map((p) => (
            <div key={p.id}>
              <div>
                <div>{p.proName} · {p.destination}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {p.provider === "manual" ? "manual UPI" : p.provider}
                  {p.utr ? ` · UTR ${p.utr}` : ""}{p.failureReason ? ` · ${p.failureReason}` : ""}
                </div>
              </div>
              <span><span className="amt">{formatRupees(p.amountPaise)}</span> <PayoutChip p={p} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
