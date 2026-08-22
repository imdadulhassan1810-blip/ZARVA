import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { PaymentActions } from "../components/PaymentActions";

export function Cart() {
  const { items, updateQuantity, removeItem, refresh } = useCart();
  const navigate = useNavigate();

  const total = items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);

  async function handleSuccess() {
    await refresh();
    navigate("/orders");
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🛒</div>
        <p className="text-slate-500">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Your cart</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4"
          >
            <div className="text-3xl">{item.listing.imageEmoji}</div>
            <div className="flex-1">
              <div className="font-semibold">{item.listing.title}</div>
              <div className="text-sm text-slate-500">
                ₹{item.listing.price.toLocaleString("en-IN")} {item.listing.priceUnit}
              </div>
            </div>
            <div className="flex items-center border border-slate-300 rounded-md">
              <button
                className="px-2 py-1"
                onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
              >
                −
              </button>
              <span className="px-2 text-sm">{item.quantity}</span>
              <button className="px-2 py-1" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                +
              </button>
            </div>
            <div className="font-semibold w-20 text-right">
              ₹{(item.listing.price * item.quantity).toLocaleString("en-IN")}
            </div>
            <button
              onClick={() => removeItem(item.id)}
              className="text-slate-400 hover:text-red-600 text-sm"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <span className="text-slate-600">Total</span>
        <span className="text-xl font-bold">₹{total.toLocaleString("en-IN")}</span>
      </div>

      <PaymentActions
        label="Checkout"
        onMockPay={() => api.checkoutCart()}
        onRazorpayInit={() => api.checkoutCartWithRazorpay()}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
