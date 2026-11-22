"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { gradient, logoRules, verticalIds, verticals, type VerticalId } from "@zarva/brand";
import { DEFAULT_HOME_POLICY, formatNotice, formatRupees, HOME_RULES, type HomeCategory, type HomeService, type ModuleStatus } from "@zarva/core";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";
import { LandingReviews } from "../components/Reviews";

/** Where each built vertical lives on the web. A tile is clickable once its module is on. */
const routes: Partial<Record<VerticalId, string>> = { home: "/home-services" };

/** Services shown under "Popular in Durgapur". Prices come from the live catalogue, never hard-coded. */
const POPULAR = ["ac-service", "bathroom-deep-clean", "fan-installation", "tap-repair", "mens-haircut", "fruit-facial", "cockroach-2bhk", "kitchen-deep-clean"];
/** Quick search chips under the search box. */
const QUICK = ["AC service", "Plumber", "Cleaning", "Electrician", "Salon"];

/** A soft tint per category so the icon tiles don't all look the same. Brand palette only. */
const TINTS = ["#FFF1D6", "#E4EEFF", "#E2F7EE", "#FFE7E5", "#F1EAFF", "#FFF1D6", "#E4EEFF", "#E2F7EE"];

const catHref = (slug: string) => `/home-services?cat=${encodeURIComponent(slug)}`;

export default function Home() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleStatus[] | null>(null);
  const [categories, setCategories] = useState<HomeCategory[] | null>(null);
  const [services, setServices] = useState<HomeService[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api.modules().then((r) => setModules(r.modules)).catch(() => setModules([]));
    api.home
      .catalog("durgapur")
      .then((r) => {
        setCategories(r.categories);
        setServices(r.services);
      })
      .catch(() => setCategories([]));
  }, []);

  // Close the search suggestions when tapping elsewhere.
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!searchRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const popular = useMemo(
    () => POPULAR.flatMap((slug) => services.filter((s) => s.slug === slug && catById.has(s.categoryId))),
    [services, catById],
  );
  const fromPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) m.set(s.categoryId, Math.min(m.get(s.categoryId) ?? Infinity, s.pricePaise));
    return m;
  }, [services]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const cats = (categories ?? [])
      .filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(t))
      .map((c) => ({ key: c.id, label: c.name, sub: c.description, icon: c.icon, href: catHref(c.slug) }));
    const svcs = services
      .filter((s) => s.name.toLowerCase().includes(t))
      .flatMap((s) => {
        const c = catById.get(s.categoryId);
        return c ? [{ key: s.id, label: s.name, sub: `${c.name} · ${formatRupees(s.pricePaise)}`, icon: c.icon, href: catHref(c.slug) }] : [];
      });
    return [...cats, ...svcs].slice(0, 7);
  }, [q, categories, services, catById]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(results[0]?.href ?? "/home-services");
  }

  const homeLive = modules?.find((m) => m.id === "home")?.enabled ?? true;
  const byId = new Map(modules?.map((m) => [m.id, m]));
  const others = verticalIds.filter((id) => id !== "home");

  return (
    <div className="landing">
      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-glow" aria-hidden />
        <div className="lp-hero-copy">
          <span className="lp-eyebrow"><span className="lp-dot" aria-hidden />Now live in Durgapur</span>
          <h1>Home services you can trust, at prices you see first.</h1>
          <p className="lp-lead">
            Electricians, plumbers, AC repair, cleaning and salon at home. Verified professionals, fixed prices, booked in a minute.
          </p>

          <form ref={searchRef} className="lp-search" role="search" onSubmit={submit}>
            <span className="lp-search-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Try 'AC service' or 'tap repair'"
              aria-label="Search home services"
              autoComplete="off"
            />
            <button className="btn lp-search-btn" type="submit">Search</button>
            {open && q.trim() && (
              <ul className="lp-suggest" role="listbox">
                {results.length === 0 ? (
                  <li className="lp-suggest-empty">No match yet. <Link href="/home-services">See all services →</Link></li>
                ) : (
                  results.map((r) => (
                    <li key={r.key}>
                      <Link href={r.href} role="option" aria-selected={false}>
                        <span className="lp-suggest-icon" aria-hidden>{r.icon}</span>
                        <span><strong>{r.label}</strong><span className="muted">{r.sub}</span></span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}
          </form>

          <div className="lp-quick" aria-label="Popular searches">
            {QUICK.map((t) => (
              <button key={t} type="button" onClick={() => { setQ(t); setOpen(true); }}>{t}</button>
            ))}
          </div>

          <div className="lp-cities" aria-label="Cities">
            <span className="lp-city lp-city-on">📍 Durgapur</span>
            <span className="lp-city">Asansol · soon</span>
            <span className="lp-city">Kolkata · soon</span>
          </div>
        </div>

        {/* Right side on desktop: a price card built from the live catalogue. */}
        <div className="lp-hero-card" aria-hidden={popular.length === 0}>
          <div className="lp-hero-card-head">
            <strong>Prices in Durgapur</strong>
            <span className="lp-badge-fixed">Fixed price</span>
          </div>
          {(popular.length ? popular.slice(0, 4) : Array.from({ length: 4 }, () => null)).map((s, i) =>
            s ? (
              <Link key={s.id} href={catHref(catById.get(s.categoryId)!.slug)} className="lp-price-row">
                <span className="lp-price-icon" style={{ background: TINTS[i] }}>{catById.get(s.categoryId)!.icon}</span>
                <span className="lp-price-name">{s.name}</span>
                <span className="lp-price-amt">{formatRupees(s.pricePaise)}</span>
              </Link>
            ) : (
              <div key={i} className="lp-price-row lp-skel" />
            ),
          )}
          <p className="lp-hero-card-foot">No surprise charges. Spare parts, if any, billed at MRP.</p>
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <section className="lp-trust" aria-label="Why ZARVA">
        <div><span aria-hidden>🛡️</span><div><strong>Verified pros</strong><span>ID and documents checked before the first job</span></div></div>
        <div><span aria-hidden>₹</span><div><strong>Fixed prices</strong><span>See the price before you book. No haggling</span></div></div>
        <div><span aria-hidden>🕑</span><div><strong>Slots 8 AM to 8 PM</strong><span>Book up to {HOME_RULES.bookingWindowDays} days ahead</span></div></div>
        <div><span aria-hidden>↩︎</span><div><strong>Free reschedule</strong><span>Move or cancel up to {formatNotice(DEFAULT_HOME_POLICY.customerCutoffMinutes)} before your slot</span></div></div>
      </section>

      {/* ---------- Categories ---------- */}
      <section className="lp-section">
        <div className="lp-section-head">
          <h2>What do you need help with?</h2>
          <Link href="/home-services" className="lp-link">See all →</Link>
        </div>
        <div className="lp-cats">
          {categories === null
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="lp-cat lp-skel" />)
            : categories.map((c, i) => (
                <Link key={c.id} href={catHref(c.slug)} className="lp-cat">
                  <span className="lp-cat-icon" style={{ background: TINTS[i % TINTS.length] }} aria-hidden>{c.icon}</span>
                  <strong>{c.name}</strong>
                  {fromPrice.has(c.id) && <span className="muted">from {formatRupees(fromPrice.get(c.id)!)}</span>}
                </Link>
              ))}
          {categories?.length === 0 && (
            <p className="muted">Couldn't load services right now. <Link href="/home-services" className="lp-link">Try the services page →</Link></p>
          )}
        </div>
      </section>

      {/* ---------- Popular services ---------- */}
      {popular.length > 0 && (
        <section className="lp-section">
          <div className="lp-section-head">
            <h2>Popular in Durgapur</h2>
          </div>
          <div className="lp-popular">
            {popular.map((s) => {
              const c = catById.get(s.categoryId)!;
              const i = (categories ?? []).indexOf(c);
              return (
                <Link key={s.id} href={catHref(c.slug)} className="lp-svc">
                  <span className="lp-svc-art" style={{ background: TINTS[i % TINTS.length] }} aria-hidden>{c.icon}</span>
                  <span className="lp-svc-body">
                    <strong>{s.name}</strong>
                    <span className="muted">{s.durationMin < 60 ? `${s.durationMin} min` : `${Math.round(s.durationMin / 6) / 10} hr`} · {c.name}</span>
                    <span className="lp-svc-price">{formatRupees(s.pricePaise)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- How it works ---------- */}
      <section className="lp-section">
        <h2>How it works</h2>
        <ol className="lp-steps">
          <li><span className="lp-step-n">1</span><strong>Pick a service</strong><span>Choose what you need and see the full price upfront.</span></li>
          <li><span className="lp-step-n">2</span><strong>Choose a time</strong><span>Pick a 1-hour arrival slot that suits you, from 2 hours ahead.</span></li>
          <li><span className="lp-step-n">3</span><strong>A verified pro arrives</strong><span>Share your start code when they reach, so only your pro can begin.</span></li>
          <li><span className="lp-step-n">4</span><strong>Pay online when you book</strong><span>UPI, card or net banking. Checkout shows the service price, charges and GST line by line before you pay.</span></li>
        </ol>
      </section>

      {/* ---------- Reviews: real ones only, from completed jobs ---------- */}
      <LandingReviews />

      {/* ---------- Partner recruiting ---------- */}
      <Link href="/partner" className="lp-partner">
        <div>
          <span className="lp-partner-kicker">For professionals</span>
          <strong>Electrician, plumber, beautician or cleaner in Durgapur?</strong>
          <span>Get jobs near you, at fixed prices, paid every week. Sign up as a ZARVA partner.</span>
        </div>
        <span className="btn lp-partner-btn" aria-hidden>Join as a partner →</span>
      </Link>

      {/* ---------- Other verticals ---------- */}
      <section className="lp-section">
        <div className="lp-section-head">
          <h2>More on ZARVA</h2>
          <span className="muted lp-small">{logoRules.tagline}</span>
        </div>
        <div className="lp-more">
          {others.map((id) => {
            const m = byId.get(id);
            const href = m?.enabled ? routes[id] : undefined;
            const body = (
              <>
                <span className="lp-more-chip" style={{ background: gradient(id) }} aria-hidden />
                <span><strong>{verticals[id].label}</strong><span className="muted">{m?.tagline ?? ""}</span></span>
                {!href && <span className="lp-soon">Soon</span>}
              </>
            );
            return href ? (
              <Link key={id} href={href} className="lp-more-item">{body}</Link>
            ) : (
              <div key={id} className="lp-more-item" aria-disabled>{body}</div>
            );
          })}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      {homeLive && (
        <section className="lp-cta">
          <div>
            <strong>Need something fixed today?</strong>
            <span>Slots open from 2 hours ahead, 8 AM to 8 PM.</span>
          </div>
          <Link href="/home-services" className="btn">Book a service</Link>
        </section>
      )}

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo width={200} caption />
          <p className="muted">Everyday services in one app. Starting with home services in Durgapur.</p>
        </div>
        <nav aria-label="Customers">
          <strong>Customers</strong>
          <Link href="/home-services">All home services</Link>
          <Link href="/home-services/bookings">Your bookings</Link>
          <Link href="/account">Account</Link>
          <Link href="/help">Help &amp; support</Link>
        </nav>
        <nav aria-label="Professionals">
          <strong>Professionals</strong>
          <Link href="/partner">Become a partner</Link>
        </nav>
        <div>
          <strong>Cities</strong>
          <span>Durgapur</span>
          <span className="muted">Asansol (soon)</span>
          <span className="muted">Kolkata (soon)</span>
        </div>
        <p className="lp-footer-legal muted">© {new Date().getFullYear()} ZARVA · Durgapur, West Bengal</p>
      </footer>
    </div>
  );
}
