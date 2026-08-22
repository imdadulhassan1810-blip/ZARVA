import { useEffect, useState } from "react";
import type { Order, RazorpayCheckoutInfo, RazorpayConfig } from "@oneapp/shared";
import { api } from "../lib/api";
import { openRazorpayCheckout } from "../lib/razorpay";
import { useAuth } from "../context/AuthContext";

interface Props {
  /** Button label for the non-Razorpay ("demo") path, e.g. "Checkout", "Book now", "Pay ₹500". */
  label: string;
  onMockPay: () => Promise<Order>;
  onRazorpayInit: () => Promise<RazorpayCheckoutInfo>;
  onSuccess: (order: Order) => void;
}

/**
 * Renders the pay/checkout/book action for anywhere money changes hands (cart
 * checkout, direct bookings, bill payments). If the backend has real Razorpay keys
 * configured it offers a genuine Razorpay Checkout flow; otherwise it falls back to
 * the original one-click "demo" confirmation so nothing breaks without keys.
 */
export function PaymentActions({ label, onMockPay, onRazorpayInit, onSuccess }: Props) {
  const { user } = useAuth();
  const [razorpay, setRazorpay] = useState<RazorpayConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getRazorpayConfig().then(setRazorpay).catch(() => setRazorpay({ enabled: false }));
  }, []);

  async function handleMockPay() {
    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await onMockPay());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRazorpayPay() {
    setSubmitting(true);
    setError(null);
    try {
      const checkout = await onRazorpayInit();
      const response = await openRazorpayCheckout({
        key: checkout.keyId,
        amount: Math.round(checkout.amount * 100),
        currency: checkout.currency,
        order_id: checkout.razorpayOrderId,
        name: "OneApp",
        description: label,
        prefill: { name: user?.name, email: user?.email, contact: user?.phone ?? undefined },
        theme: { color: "#2a5cf5" },
      });

      if (!response) {
        setError("Payment cancelled. Your order is still pending — you can try again.");
        return;
      }

      const verified = await api.verifyRazorpayPayment({
        orderId: checkout.order.id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      onSuccess(verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {razorpay?.enabled ? (
        <>
          <button
            onClick={handleRazorpayPay}
            disabled={submitting}
            className="w-full bg-[#3395FF] hover:brightness-95 disabled:opacity-60 text-white rounded-md py-3 font-semibold"
          >
            {submitting ? "Please wait…" : `Pay with Razorpay`}
          </button>
          <button
            onClick={handleMockPay}
            disabled={submitting}
            className="w-full text-slate-500 hover:text-slate-700 text-xs underline"
          >
            or use the demo checkout instead
          </button>
        </>
      ) : (
        <button
          onClick={handleMockPay}
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-md py-3 font-semibold"
        >
          {submitting ? "Please wait…" : label}
        </button>
      )}
    </div>
  );
}
