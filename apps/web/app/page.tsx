"use client";
import { useEffect, useState } from "react";
import { gradient, logoRules, verticalIds, verticals, type VerticalId } from "@zarva/brand";
import type { ModuleStatus } from "@zarva/core";
import { api } from "../lib/api";

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
          return (
            <div key={id} className="tile" style={{ background: gradient(id) }} aria-disabled={!m?.enabled}>
              {!m?.enabled && <span className="badge">Coming soon</span>}
              <strong>{verticals[id].label}</strong>
              <span>{m?.tagline ?? ""}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
