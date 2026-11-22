"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { gradient } from "@zarva/brand";
import { formatRupees, homeTotals, HOME_RULES, type HomeCategory, type HomeCity, type HomeRatingSummary, type HomeService } from "@zarva/core";
import { CategoryReviews, RatingBadge } from "../../components/Reviews";
import { api } from "../../lib/api";
import { loadCart, saveCart, type Cart } from "../../lib/cart";

export default function HomeServices() {
  const router = useRouter();
  const [cities, setCities] = useState<HomeCity[]>([]);
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [services, setServices] = useState<HomeService[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({ cityId: "durgapur", categoryId: null, items: {} });
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, HomeRatingSummary>>({});

  useEffect(() => {
    const c = loadCart();
    setCart(c);
    setActive(c.categoryId);
    api.home.cities().then((r) => setCities(r.cities)).catch(() => {});
    api.home.ratingSummary().then((r) => setRatings(r.categories)).catch(() => {});
    api.home
      .catalog(c.cityId)
      .then((r) => {
        setCategories(r.categories);
        setServices(r.services);
        // Links from the landing page open a category directly: /home-services?cat=electrician
        const slug = new URLSearchParams(window.location.search).get("cat");
        const fromLink = slug ? r.categories.find((x) => x.slug === slug) : undefined;
        if (fromLink) setActive(fromLink.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const lines = Object.entries(cart.items).flatMap(([id, qty]) => {
    const s = byId.get(id);
    return s ? [{ unitPricePaise: s.pricePaise, qty }] : [];
  });
  const totals = homeTotals(lines);
  const count = lines.reduce((n, l) => n + l.qty, 0);

  function setQty(s: HomeService, qty: number) {
    const sameCategory = cart.categoryId === s.categoryId;
    if (!sameCategory && count > 0 && qty > 0) {
      if (!window.confirm("Your cart has a different service type. Start a new cart?")) return;
    }
    const items = sameCategory ? { ...cart.items } : {};
    if (qty <= 0) delete items[s.id];
    else items[s.id] = Math.min(qty, HOME_RULES.maxQtyPerItem);
    const next: Cart = { ...cart, categoryId: Object.keys(items).length ? s.categoryId : null, items };
    setCart(next);
    saveCart(next);
  }

  const cat = categories.find((c) => c.id === active);
  return (
    <div style={{ paddingBottom: 120 }}>
      <section className="home-hero" style={{ background: gradient("home") }}>
        <div>
          <h1>Home services</h1>
          <p>Verified electricians, plumbers, cleaners and beauticians at your door.</p>
        </div>
        <div className="city-pills" aria-label="Cities">
          {cities.map((c) => (
            <span key={c.id} className={`pill ${c.id === cart.cityId ? "pill-on" : ""}`} aria-current={c.id === cart.cityId}>
              {c.name}{!c.active && " · soon"}
            </span>
          ))}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {!cat ? (
        <>
          <h2>What do you need?</h2>
          <div className="cat-grid">
            {categories.map((c) => (
              <button key={c.id} className="cat-card" onClick={() => setActive(c.id)}>
                <span className="cat-icon" aria-hidden>{c.icon}</span>
                <strong>{c.name}</strong>
                <span className="muted">{c.description}</span>
                <RatingBadge summary={ratings[c.slug]} compact />
              </button>
            ))}
          </div>
          <div className="trust-row">
            <span>✔ Background-checked professionals</span>
            <span>✔ Fixed prices, no haggling</span>
            <span>✔ Free cancellation up to 2 hours before</span>
          </div>
        </>
      ) : (
        <>
          <button className="btn btn-ghost" onClick={() => setActive(null)} style={{ marginTop: 16 }}>← All services</button>
          <h2 style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span aria-hidden>{cat.icon}</span>{cat.name} <RatingBadge summary={ratings[cat.slug]} /></h2>
          <div className="stack">
            {services.filter((s) => s.categoryId === cat.id).map((s) => {
              const qty = cart.items[s.id] ?? 0;
              return (
                <div key={s.id} className="card svc">
                  <div style={{ flex: 1 }}>
                    <strong>{s.name}</strong>
                    <div className="muted" style={{ fontSize: 14 }}>{s.description}</div>
                    <div className="svc-meta">
                      <span className="price">{formatRupees(s.pricePaise)}</span>
                      <span className="muted">· {s.durationMin < 60 ? `${s.durationMin} min` : `${Math.round(s.durationMin / 6) / 10} hr`}</span>
                    </div>
                    {s.inclusions.length > 0 && (
                      <ul className="incl">{s.inclusions.map((i) => <li key={i}>{i}</li>)}</ul>
                    )}
                  </div>
                  {qty === 0 ? (
                    <button className="btn btn-add" onClick={() => setQty(s, 1)}>Add</button>
                  ) : (
                    <div className="stepper" aria-label={`Quantity of ${s.name}`}>
                      <button onClick={() => setQty(s, qty - 1)} aria-label="Remove one">−</button>
                      <span>{qty}</span>
                      <button onClick={() => setQty(s, qty + 1)} aria-label="Add one" disabled={qty >= HOME_RULES.maxQtyPerItem}>+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <CategoryReviews categorySlug={cat.slug} categoryName={cat.name} />
        </>
      )}

      <p className="muted" style={{ marginTop: 32, fontSize: 14 }}>
        <Link href="/home-services/bookings">Your bookings →</Link>
      </p>

      {count > 0 && (
        <div className="cart-bar">
          <div>
            <strong>{count} item{count > 1 ? "s" : ""} · {formatRupees(totals.totalPaise)}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {totals.feePaise > 0 ? `Incl. ${formatRupees(totals.feePaise)} fee. Add ${formatRupees(HOME_RULES.freeFeeAbovePaise - totals.subtotalPaise)} more to skip it.` : "No convenience fee"}
            </div>
          </div>
          <button className="btn" onClick={() => router.push("/home-services/checkout")}>Continue</button>
        </div>
      )}
    </div>
  );
}
