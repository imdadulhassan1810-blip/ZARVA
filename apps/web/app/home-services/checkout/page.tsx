"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  formatPhone, formatRupees, homeTotals, HOME_RULES,
  type Address, type HomePayMode, type HomeService, type HomeSlotDay,
} from "@zarva/core";
import { api, isSignedIn } from "../../../lib/api";
import { clearCart, loadCart, type Cart } from "../../../lib/cart";
import { payForBooking } from "../../../lib/pay";

export default function Checkout() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [services, setServices] = useState<HomeService[]>([]);
  const [pincodesOk, setPincodesOk] = useState(true);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [days, setDays] = useState<HomeSlotDay[]>([]);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<HomePayMode>("online");
  const [note, setNote] = useState("");
  // null until we know the account's current choice. Never pre-ticked: WhatsApp needs a real opt-in.
  const [whatsapp, setWhatsapp] = useState<boolean | null>(null);
  const [whatsappWas, setWhatsappWas] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per checkout visit: a double click or retry after a network error never books twice.
  const [idempotencyKey] = useState(() => `web-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!isSignedIn()) return router.replace(`/login?next=${encodeURIComponent("/home-services/checkout")}`);
    const c = loadCart();
    if (!c.categoryId || Object.keys(c.items).length === 0) return router.replace("/home-services");
    // Bookings need a verified mobile: send phone-less accounts (Google/email sign-ups) to add one first.
    api.me().then((r) => {
      if (!r.user.phone) router.replace(`/account?next=${encodeURIComponent("/home-services/checkout")}`);
      setWhatsappWas(r.user.whatsappOptIn);
      setWhatsapp(r.user.whatsappOptIn);
    }).catch(() => undefined);
    setCart(c);
    api.home.catalog(c.cityId).then((r) => setServices(r.services)).catch((e: Error) => setError(e.message));
    api.listAddresses().then((r) => {
      setAddresses(r.addresses);
      setAddressId(r.addresses.find((a) => a.isDefault)?.id ?? r.addresses[0]?.id ?? null);
    }).catch(() => router.replace("/login?next=/home-services/checkout"));
    api.home.slots(c.cityId, c.categoryId).then((r) => {
      setDays(r.days);
      const first = r.days.findIndex((d) => d.slots.some((s) => s.available));
      setDay(first < 0 ? 0 : first);
    }).catch((e: Error) => setError(e.message));
  }, [router]);

  useEffect(() => setPincodesOk(true), [addressId]);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  if (!cart) return <p className="muted">Loading…</p>;
  const lines = Object.entries(cart.items).flatMap(([id, qty]) => {
    const s = byId.get(id);
    return s ? [{ s, qty, unitPricePaise: s.pricePaise }] : [];
  });
  const totals = homeTotals(lines);
  const noSlots = days.length > 0 && days.every((d) => d.slots.every((s) => !s.available));

  async function book() {
    if (!cart || !addressId || !slot) return;
    setBusy(true);
    setError(null);
    try {
      if (whatsapp !== null && whatsapp !== whatsappWas) {
        await api.updateMe({ whatsappOptIn: whatsapp }).catch(() => undefined);
        setWhatsappWas(whatsapp);
      }
      const r = await api.home.createBooking({
        cityId: cart.cityId, addressId, slotStart: slot, payMode, note: note.trim() || undefined, idempotencyKey,
        items: Object.entries(cart.items).map(([serviceId, qty]) => ({ serviceId, qty })),
      });
      clearCart();
      if (r.payment) {
        try {
          await payForBooking(r.booking.id, r.payment);
        } catch (e) {
          // Booking exists and the slot is held; the booking page offers "Pay now".
          router.push(`/home-services/bookings/${r.booking.id}?payError=${encodeURIComponent((e as Error).message)}`);
          return;
        }
      }
      router.push(`/home-services/bookings/${r.booking.id}?new=1`);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "not_serviceable") setPincodesOk(false);
      if (err.code === "slot_full") {
        setSlot(null);
        api.home.slots(cart.cityId, cart.categoryId!).then((r) => setDays(r.days)).catch(() => {});
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto 64px" }}>
      <h1>Checkout</h1>

      <h2>1. Address</h2>
      <div className="stack">
        {addresses.length === 0 && <p className="muted">No saved address yet.</p>}
        {addresses.map((a) => (
          <label key={a.id} className={`card choice ${addressId === a.id ? "choice-on" : ""}`}>
            <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
            <div>
              <strong style={{ textTransform: "capitalize" }}>{a.label}</strong> · {a.name}, {formatPhone(a.phone)}
              <div className="muted" style={{ fontWeight: 400 }}>{[a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`].filter(Boolean).join(", ")}</div>
            </div>
          </label>
        ))}
        <Link className="btn btn-ghost" href="/account">+ Add or edit addresses</Link>
        {!pincodesOk && <p className="error">We don't serve this PIN code yet. Durgapur PINs 713201 to 713216 are live.</p>}
      </div>

      <h2>2. Date and time</h2>
      {noSlots ? (
        <p className="card">All professionals for this service are booked for the next 7 days. Try another service or check back tomorrow.</p>
      ) : (
        <>
          <div className="day-row" role="tablist">
            {days.map((d, i) => (
              <button key={d.date} role="tab" aria-selected={i === day} className={`day ${i === day ? "day-on" : ""}`} onClick={() => { setDay(i); setSlot(null); }}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="slot-grid">
            {days[day]?.slots.map((s) => (
              <button key={s.start} disabled={!s.available} className={`slot ${slot === s.start ? "slot-on" : ""}`} onClick={() => setSlot(s.start)}>
                {s.label}
              </button>
            ))}
            {days[day]?.slots.length === 0 && <p className="muted">No more slots today.</p>}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>The professional arrives within the hour you pick.</p>
        </>
      )}

      <h2>3. Payment</h2>
      <div className="stack">
        <label className={`card choice ${payMode === "online" ? "choice-on" : ""}`}>
          <input type="radio" name="pay" checked={payMode === "online"} onChange={() => setPayMode("online")} />
          <div><strong>Pay now</strong><div className="muted" style={{ fontWeight: 400 }}>UPI, cards or netbanking. Full refund if you cancel 2+ hours before.</div></div>
        </label>
        <label className={`card choice ${payMode === "after_service" ? "choice-on" : ""}`}>
          <input type="radio" name="pay" checked={payMode === "after_service"} onChange={() => setPayMode("after_service")} />
          <div><strong>Pay after service</strong><div className="muted" style={{ fontWeight: 400 }}>Cash or UPI to the professional when the job is done.</div></div>
        </label>
        {whatsapp !== null && (
          <label className="choice" style={{ fontSize: 15 }}>
            <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
            <span>Also send me booking updates on WhatsApp <span className="muted">(SMS is always sent)</span></span>
          </label>
        )}
        <label>
          Note for the professional (optional)
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ring the bell twice, 2nd floor" />
        </label>
      </div>

      <h2>Summary</h2>
      <div className="card stack">
        {lines.map((l) => (
          <div key={l.s.id} className="sum-row"><span>{l.s.name} × {l.qty}</span><span>{formatRupees(l.s.pricePaise * l.qty)}</span></div>
        ))}
        {totals.feePaise > 0 && <div className="sum-row muted"><span>Convenience fee (orders under {formatRupees(HOME_RULES.freeFeeAbovePaise)})</span><span>{formatRupees(totals.feePaise)}</span></div>}
        <div className="sum-row total"><span>Total (incl. taxes)</span><span>{formatRupees(totals.totalPaise)}</span></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy || !addressId || !slot} onClick={book}>
        {busy ? "Booking…" : !addressId ? "Add an address first" : !slot ? "Pick a time slot" : payMode === "online" ? `Pay ${formatRupees(totals.totalPaise)} and book` : "Confirm booking"}
      </button>
    </div>
  );
}
