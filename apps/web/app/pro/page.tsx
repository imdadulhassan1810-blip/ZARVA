"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPhone, formatRupees, type HomeBooking, type HomeCategory, type HomePro } from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../components/BookingBits";
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
  if (pro === null) return <Apply cats={cats} onDone={setPro} />;
  if (pro.status !== "active") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1>Hi {pro.name}</h1>
        <div className="card">{pro.status === "pending" ? "Your profile is under review. We'll call you to verify your ID and skills, usually within 2 working days." : "Your profile is suspended. Please call ZARVA partner support."}</div>
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
      <h1>Partner jobs</h1>
      <p className="muted" style={{ marginTop: 0 }}>{pro.name} · {pro.locality ?? "Durgapur"} · {pro.jobsDone} jobs done</p>
      {error && <p className="error" role="alert">{error}</p>}

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
    </div>
  );
}

function Apply({ cats, onDone }: { cats: HomeCategory[]; onDone: (p: HomePro) => void }) {
  const [name, setName] = useState("");
  const [locality, setLocality] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ maxWidth: 560, margin: "0 auto 64px" }}>
      <h1>Become a ZARVA partner</h1>
      <p className="muted">Get jobs near you in Durgapur on your phone, at fixed prices.</p>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          onDone((await api.home.proApply({ name: name.trim(), cityId: "durgapur", categoryIds: picked, locality: locality.trim() || undefined })).pro);
        } catch (err) { setError((err as Error).message); }
      }}>
        <label>Full name (as on Aadhaar)<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label>Your area in Durgapur<input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="e.g. Benachity" /></label>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>What work do you do?</legend>
          {cats.map((c) => (
            <label key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" style={{ minHeight: 20, width: 20 }} checked={picked.includes(c.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
              {c.icon} {c.name}
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={picked.length === 0 || name.trim().length < 2}>Apply</button>
      </form>
    </div>
  );
}
