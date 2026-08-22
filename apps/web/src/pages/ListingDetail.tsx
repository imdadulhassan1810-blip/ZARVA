import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { FareQuote, GeoPoint, Listing, Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG, TRACKABLE_CATEGORY_SLUGS } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { PaymentActions } from "../components/PaymentActions";
import { CabMapPicker } from "../components/CabMapPicker";

export function ListingDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const date = searchParams.get("date") ?? undefined;
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [listing, setListing] = useState<Listing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Order | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    setListing(null);
    api.getListing(id, date).catch((err) => setError(err instanceof Error ? err.message : "Not found")).then((l) => {
      if (l) setListing(l);
    });
  }, [id, date]);

  const isCab = listing?.categorySlug === "cab";

  // Re-quote the fare live whenever both pins are set (or moved) — this is what's actually charged.
  useEffect(() => {
    if (!isCab || !listing || !pickup || !drop) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    api
      .quoteCabFare({ listingId: listing.id, pickup, drop })
      .then((q) => !cancelled && setQuote(q))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't price this ride"))
      .finally(() => !cancelled && setQuoting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCab, listing?.id, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng]);

  if (error && !listing) return <p className="text-red-600 text-sm">{error}</p>;
  if (!listing) return <p className="text-slate-500">Loading…</p>;

  const category = CATEGORY_BY_SLUG[listing.categorySlug];
  const isBooking = category?.group === "booking";
  const needsPickupDrop = isCab && (!pickup || !drop);
  const isTrackable = TRACKABLE_CATEGORY_SLUGS.includes(listing.categorySlug);
  const displayPrice = isCab ? (quote?.total ?? listing.price) : listing.price;
  const displayTotal = isCab ? (quote?.total ?? 0) : listing.price * quantity;

  function bookingDetails() {
    return isCab ? { pickup, drop } : undefined;
  }

  async function handleAddToCart() {
    if (!user) {
      navigate("/login", { state: { from: location } });
      return;
    }
    if (!listing) return;
    setSubmitting(true);
    setError(null);
    try {
      await addToCart(listing.id, quantity);
      navigate("/cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBookingSuccess(order: Order) {
    setConfirmed(order);
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center mt-8">
        <div className="text-4xl mb-3">✅</div>
        <h1 className="text-xl font-bold mb-1">Booking confirmed!</h1>
        <p className="text-slate-500 text-sm mb-4">
          {listing.title} is booked. Order ref <span className="font-mono">{confirmed.id.slice(0, 8)}</span>.
        </p>
        <div className="flex gap-2 justify-center">
          {isTrackable && (
            <button
              onClick={() => navigate(`/tracking/${confirmed.id}`)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 text-sm font-medium"
            >
              Track live
            </button>
          )}
          <button
            onClick={() => navigate("/orders")}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 text-sm font-medium"
          >
            View my orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex items-start gap-4">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover bg-slate-100" />
        ) : (
          <div className="text-5xl">{listing.imageEmoji}</div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold">{listing.title}</h1>
          {listing.subtitle && <p className="text-slate-500">{listing.subtitle}</p>}
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            {listing.location && <span>📍 {listing.location}</span>}
            {listing.rating != null && <span>⭐ {listing.rating.toFixed(1)}</span>}
            {Boolean(listing.meta.dynamicPricing) && (
              <span className="text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 font-medium">
                🔥 Live pricing
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-brand-700">
            {isCab && !quote ? "—" : `₹${displayPrice.toLocaleString("en-IN")}`}
          </div>
          <div className="text-xs text-slate-500">{isCab ? "estimated fare" : listing.priceUnit}</div>
        </div>
      </div>

      {Object.keys(listing.meta).length > 0 && (
        <dl className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-4">
          {Object.entries(listing.meta)
            .filter(([k]) => {
              const hidden = ["dynamicPricing", "basePrice", "priceMultiplier"];
              const cabPricingKeys = ["perKmRate", "perMinRate", "avgSpeedKmh"]; // shown in the fare breakdown instead
              return !hidden.includes(k) && !(isCab && cabPricingKeys.includes(k));
            })
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="font-medium">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </div>
            ))}
        </dl>
      )}

      {isCab && (
        <div>
          <label className="text-sm font-medium block mb-2">Pickup & drop location</label>
          <CabMapPicker
            pickup={pickup}
            drop={drop}
            onChange={(next) => {
              setPickup(next.pickup);
              setDrop(next.drop);
            }}
          />
          {quoting && <p className="text-xs text-slate-500 mt-2">Calculating fare…</p>}
          {quote && (
            <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {quote.distanceKm} km · ~{quote.durationMin} min
                </span>
                <span className="text-slate-500">Base ₹{quote.baseFare} + ₹{quote.distanceFare} dist. + ₹{quote.timeFare} time</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className={quote.surgeMultiplier > 1 ? "text-amber-700" : "text-slate-600"}>
                  {quote.surgeMultiplier > 1 ? `⚡ ${quote.surgeMultiplier}× surge — ${quote.surgeReason}` : "No surge right now"}
                </span>
                <span>₹{quote.total}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!isCab && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">{isBooking ? "Quantity / travellers" : "Quantity"}</label>
          <div className="flex items-center border border-slate-300 rounded-md">
            <button className="px-3 py-1 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} type="button">
              −
            </button>
            <span className="px-3 text-sm font-medium">{quantity}</span>
            <button className="px-3 py-1 text-lg" onClick={() => setQuantity((q) => Math.min(20, q + 1))} type="button">
              +
            </button>
          </div>
          <span className="text-sm text-slate-500 ml-auto">
            Total: <span className="font-bold text-slate-900">₹{displayTotal.toLocaleString("en-IN")}</span>
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isBooking ? (
        needsPickupDrop ? (
          <button disabled className="w-full bg-slate-200 text-slate-500 rounded-md py-3 font-semibold cursor-not-allowed">
            Set pickup & drop on the map to continue
          </button>
        ) : isCab && (quoting || !quote) ? (
          <button disabled className="w-full bg-slate-200 text-slate-500 rounded-md py-3 font-semibold cursor-not-allowed">
            {quoting ? "Calculating fare…" : "Waiting for fare…"}
          </button>
        ) : !user ? (
          <button
            onClick={() => navigate("/login", { state: { from: location } })}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-md py-3 font-semibold"
          >
            Log in to book
          </button>
        ) : (
          <PaymentActions
            label={isCab && quote ? `Book now — ₹${quote.total}` : "Book now"}
            onMockPay={() => api.createBooking({ listingId: listing.id, quantity, details: bookingDetails() })}
            onRazorpayInit={() => api.createBookingWithRazorpay({ listingId: listing.id, quantity, details: bookingDetails() })}
            onSuccess={handleBookingSuccess}
          />
        )
      ) : (
        <button
          onClick={handleAddToCart}
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-md py-3 font-semibold"
        >
          {submitting ? "Please wait…" : "Add to cart"}
        </button>
      )}
    </div>
  );
}
