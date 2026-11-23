"use client";
import { useState } from "react";
import { formatHour, weekdayShort, type HomePro, type HomeProAvailability } from "@zarva/core";
import { partnerApi as api } from "../lib/api";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7 AM ... 11 PM

/**
 * Partner availability. ZARVA gives jobs out automatically: a paid booking goes straight to a free
 * partner who is switched on and working that day and hour. No accept step, so this must be right.
 */
export function ProAvailability({ pro, onPro, compact = false }: { pro: HomePro; onPro: (p: HomePro) => void; compact?: boolean }) {
  const [a, setA] = useState<HomeProAvailability>(pro.availability);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: HomeProAvailability) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.home.proSetAvailability(next);
      onPro(r.pro);
      setA(r.pro.availability);
      setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }

  const toggle = (
    <div style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ flex: 1 }}>
        <strong>{a.acceptingJobs ? "You're on: taking new jobs" : "You're off: no new jobs"}</strong>
        <span className="muted" style={{ display: "block", fontSize: 13 }}>
          {a.acceptingJobs
            ? `ZARVA gives you jobs automatically, ${a.workDays.length === 7 ? "every day" : a.workDays.map((d) => weekdayShort[d]).join(", ")}, ${formatHour(a.workStartHour)} to ${formatHour(a.workEndHour)}. You get an SMS for each one.`
            : "Switch on to get jobs again. Jobs you already have stay with you."}
        </span>
      </span>
      <input type="checkbox" role="switch" aria-label="Taking new jobs" checked={a.acceptingJobs} disabled={busy}
        onChange={(e) => void save({ ...a, acceptingJobs: e.target.checked })} style={{ width: 24, height: 24, flex: "0 0 auto", margin: 0 }} />
    </div>
  );
  if (compact) return <div className="card stack">{toggle}{msg && !msg.ok && <span className="error">{msg.text}</span>}</div>;

  return (
    <div className="card stack">
      {toggle}
      <strong>Days you work</strong>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {weekdayShort.map((label, d) => {
          const on = a.workDays.includes(d);
          return (
            <button key={d} type="button" className={`day ${on ? "day-on" : ""}`} aria-pressed={on} style={{ flex: "0 0 auto", minWidth: 52, width: "auto" }}
              onClick={() => setA({ ...a, workDays: on ? a.workDays.filter((x) => x !== d) : [...a.workDays, d].sort() })}>{label}</button>
          );
        })}
      </div>
      <div className="row">
        <label>From
          <select value={a.workStartHour} onChange={(e) => setA({ ...a, workStartHour: Number(e.target.value) })}>
            {HOURS.slice(0, -1).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </label>
        <label>Until
          <select value={a.workEndHour} onChange={(e) => setA({ ...a, workEndHour: Number(e.target.value) })}>
            {HOURS.slice(1).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </label>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>You only get jobs that start inside these hours. Customers book from 8 AM to 7 PM.</span>
      {msg && <span className={msg.ok ? "banner-ok" : "error"}>{msg.text}</span>}
      <button className="btn" disabled={busy || a.workDays.length === 0} onClick={() => void save(a)}>{busy ? "Saving…" : "Save work hours"}</button>
    </div>
  );
}
