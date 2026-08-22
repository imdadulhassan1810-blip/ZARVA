import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { GeoPoint, Listing, Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { PaymentActions } from "../components/PaymentActions";
import { CabMapPicker } from "../components/CabMapPicker";

export function ListingDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [listing, setListing] = useState<Listing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);

  useEffect(() => {
    setListing(null);
    api.getListing(id).catch((err) => setError(err instanceof Error ? err.message : "Not found")).then((l) => {
      if (l) setListing(l);
    });
  }, [id]);

  if (error && !listing) return <p className="text-red-600 text-sm">{error}</p>;
  if (!listing) return <p className="text-slate-500">Loading…</p>;

  const category = CATEGORY_BY_SLUG[listing.categorySlug];
  const isBooking = category?.group === "booking";
  const isCab = listing.categorySlug === "cab";
  const needsPickupDrop = isCab && (!pickup || !drop);

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
    setConfirmed(order.id);
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center mt-8">
        <div className="text-4xl mb-3">✅</div>
        <h1 className="text-xl font-bold mb-1">Booking confirmed!</h1>
        <p className="text-slate-500 text-sm mb-4">
          {listing.title} is booked. Order ref <span className="font-mono">{confirmed.slice(0, 8)}</span>.
        </p>
        <button
          onClick={() => navigate("/orders")}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 text-sm font-medium"
        >
          View my orders
        </button>
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
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-brand-700">₹{listing.price.toLocaleString("en-IN")}</div>
          <div className="text-xs text-slate-500">{listing.priceUnit}</div>
        </div>
      </div>

      {Object.keys(listing.meta).length > 0 && (
        <dl className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-4">
          {Object.entries(listing.meta).map(([k, v]) => (
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
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">{isBooking ? "Quantity / travellers" : "Quantity"}</label>
        <div className="flex items-center border border-slate-300 rounded-md">
          <button
            className="px-3 py-1 text-lg"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            type="button"
          >
            −
          </button>
          <span className="px-3 text-sm font-medium">{quantity}</span>
          <button
            className="px-3 py-1 text-lg"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            type="button"
          >
            +
          </button>
        </div>
        <span className="text-sm text-slate-500 ml-auto">
          Total: <span className="font-bold text-slate-900">₹{(listing.price * quantity).toLocaleString("en-IN")}</span>
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isBooking ? (
        needsPickupDrop ? (
          <button disabled className="w-full bg-slate-200 text-slate-500 rounded-md py-3 font-semibold cursor-not-allowed">
            Set pickup & drop on the map to continue
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
            label="Book now"
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
