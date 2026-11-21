"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { gradient, logoRules, verticalIds, verticals, type VerticalId } from "@zarva/brand";
import type { ModuleStatus } from "@zarva/core";
import { api } from "../lib/api";

/** Where each built vertical lives on the web. A tile is clickable once its module is on. */
const routes: Partial<Record<VerticalId, string>> = { home: "/home-services" };

export default function Home() {
  const [modules, setModules] = useState<ModuleStatus[] | null>(null);
  useEffect(() => {
    api.modules().then((r) => setModules(r.modules)).catch(() => setModules([]));
  }, []);

  const byId = new Map(modules?.map((m) => [m.id, m]));
  return (
    <>
      <section className="hero">
        <h1>Everything you need, one app.</h1>
        <p className="tagline">{logoRules.tagline}</p>
      </section>
      <div className="tiles">
        {verticalIds.map((id: VerticalId) => {
          const m = byId.get(id);
          const href = m?.enabled ? routes[id] : undefined;
          const body = (
            <>
              {!href && <span className="badge">Coming soon</span>}
              {href && id === "home" && <span className="badge">Durgapur</span>}
              <strong>{verticals[id].label}</strong>
              <span>{m?.tagline ?? ""}</span>
            </>
          );
          return href ? (
            <Link key={id} href={href} className="tile tile-live" style={{ background: gradient(id) }}>{body}</Link>
          ) : (
            <div key={id} className="tile" style={{ background: gradient(id) }} aria-disabled>{body}</div>
          );
        })}
      </div>
      <Link href="/partner" className="card partner-cta">
        <div>
          <strong>Electrician, plumber, beautician or cleaner in Durgapur?</strong>
          <div className="muted">Get jobs near you, at fixed prices, paid every week. Sign up as a ZARVA partner.</div>
        </div>
        <span className="btn btn-ghost" aria-hidden>Join →</span>
      </Link>
    </>
  );
}
