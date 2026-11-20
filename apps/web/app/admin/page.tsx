"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  formatPhone, formatRupees, homeBookingStatuses, homeStatusLabel,
  type HomeBooking, type HomeBookingStatus, type HomeCategory, type HomePro, type HomeService,
} from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../components/BookingBits";
import { api, isSignedIn } from "../../lib/api";

type Tab = "bookings" | "pros" | "prices";

/** Minimal operations console. Access: phone numbers in the API's ADMIN_PHONES setting. */
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, p, s] = await Promise.all([
      api.home.admin.bookings(status || undefined), api.home.admin.pros(), api.home.admin.services(),
    ]);
    setBookings(b.bookings);
    setPros(p.pros);
    setServices(s.services);
  }, [status]);

  useEffect(() => {
    if (!isSignedIn()) return router.replace("/login?next=/admin");
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
  }, [router]);

  const [gate, setGate] = useState<"checking" | "code" | "open">("checking");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!isSignedIn()) return;
    api.adminStatus().then((s) => {
      if (!s.admin) setAllowed(false);
      else setGate(s.unlocked ? "open" : "code");
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (gate !== "open") return;
    load().then(() => setAllowed(true)).catch((e: Error & { status?: number; code?: string }) => {
      if (e.code === "admin_code_required") setGate("code");
      else if (e.status === 403) setAllowed(false);
      else setError(e.message);
    });
  }, [load, gate]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }

  if (allowed !== false && gate === "code") {
    return (
      <form className="card stack" style={{ maxWidth: 420, margin: "32px auto" }} onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api.adminUnlock(code);
          setCode("");
          setGate("open");
        } catch (err) { setError((err as Error).message); }
      }}>
        <h1 style={{ margin: 0 }}>Admin check</h1>
        <p className="muted" style={{ margin: 0 }}>Open your authenticator app and enter the 6-digit code for ZARVA Admin. You stay unlocked on this device for 8 hours.</p>
        <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Authenticator code" autoFocus />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={code.length !== 6}>Unlock admin</button>
      </form>
    );
  }
  if (allowed === false) return <div className="card" style={{ marginTop: 24 }}>This account does not have admin access.</div>;
  if (allowed === null) return <p className="muted">{error ?? "Loading…"}</p>;

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
  const activePros = pros.filter((p) => p.status === "active");

  return (
    <div style={{ marginBottom: 64 }}>
      <h1>Home services admin</h1>
      <div className="day-row" role="tablist">
        {(["bookings", "pros", "prices"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`day ${tab === t ? "day-on" : ""}`} onClick={() => setTab(t)}>
            {t === "bookings" ? "Bookings" : t === "pros" ? `Professionals${pros.some((p) => p.status === "pending") ? " •" : ""}` : "Prices"}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {tab === "bookings" && (
        <>
          <label style={{ maxWidth: 280, margin: "12px 0" }}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as HomeBookingStatus | "")}>
              <option value="">All</option>
              {homeBookingStatuses.map((s) => <option key={s} value={s}>{homeStatusLabel[s]}</option>)}
            </select>
          </label>
          <div className="stack">
            {bookings.length === 0 && <p className="muted">No bookings with this status.</p>}
            {bookings.map((b) => {
              const fit = activePros.filter((p) => p.categoryIds.includes(b.categoryId) && p.cityId === b.cityId);
              return (
                <div key={b.id} className="card stack">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{b.code} · {b.categoryName} · {when(b)}</strong><StatusChip b={b} />
                  </div>
                  <div>{itemsLine(b)} · <strong>{formatRupees(b.totalPaise)}</strong> · {b.payMode === "online" ? (b.paid ? "paid online" : "unpaid") : "pay after service"}</div>
                  <div className="muted">{b.address.name}, {formatPhone(b.address.phone)} · {[b.address.line1, b.address.line2, b.address.pincode].filter(Boolean).join(", ")}</div>
                  {b.pro && <div>Professional: {b.pro.name}{b.pro.phone ? ` (${formatPhone(b.pro.phone)})` : ""}</div>}
                  {(b.status === "confirmed" || b.status === "assigned") && (
                    <div className="row">
                      <select defaultValue="" onChange={(e) => e.target.value && void run(() => api.home.admin.assign(b.id, e.target.value))}>
                        <option value="">{b.pro ? "Reassign to…" : "Assign to…"}</option>
                        {fit.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.locality ?? ""}</option>)}
                      </select>
                      <button className="btn btn-danger" onClick={() => {
                        const reason = window.prompt("Reason for cancelling (the customer sees this)");
                        if (reason && reason.trim().length >= 3) void run(() => api.home.admin.cancel(b.id, reason.trim()));
                      }}>Cancel booking</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "pros" && (
        <div className="stack" style={{ marginTop: 12 }}>
          {pros.length === 0 && <p className="muted">No professionals yet. They apply at /pro.</p>}
          {pros.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{p.name}</strong> <span className={`chip chip-${p.status === "active" ? "ok" : p.status === "pending" ? "warn" : "bad"}`}>{p.status}</span>
                <div className="muted">{formatPhone(p.phone)} · {p.locality ?? p.cityId} · {p.jobsDone} jobs</div>
                <div style={{ fontSize: 14 }}>{p.categoryIds.map(catName).join(", ")}</div>
              </div>
              <div className="row" style={{ flex: "0 0 auto" }}>
                {p.status !== "active" && <button className="btn btn-ghost" onClick={() => run(() => api.home.admin.setProStatus(p.id, "active"))}>Approve</button>}
                {p.status === "active" && <button className="btn btn-danger" onClick={() => run(() => api.home.admin.setProStatus(p.id, "suspended"))}>Suspend</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "prices" && (
        <div className="stack" style={{ marginTop: 12 }}>
          {cats.map((c) => (
            <div key={c.id} className="card stack">
              <strong>{c.icon} {c.name}</strong>
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
          ))}
        </div>
      )}
    </div>
  );
}
