import { useEffect, useState } from "react";
import type { Order, OnlinePaymentMethod, RazorpayCheckoutInfo, RazorpayConfig } from "@oneapp/shared";
import { api } from "../lib/api";
import { openRazorpayCheckout } from "../lib/razorpay";
import { useAuth } from "../context/AuthContext";

type SelectableMethod = "cod" | OnlinePaymentMethod;

const METHOD_META: Record<SelectableMethod, { title: string; icon: string; hint: string }> = {
  razorpay: { title: "UPI / Wallet", icon: "📱", hint: "GPay, PhonePe, Paytm & more" },
  card: { title: "Credit / Debit Card", icon: "💳", hint: "Visa, Mastercard, RuPay" },
  netbanking: { title: "Net Banking", icon: "🏦", hint: "Pay via your bank account" },
  cod: { title: "Cash on Delivery", icon: "💵", hint: "Pay when it arrives" },
};

// Restricts which tab of the Razorpay Checkout widget opens, per chosen method.
const RAZORPAY_METHOD_CONFIG: Record<OnlinePaymentMethod, Record<string, string>> = {
  card: { card: "1", netbanking: "0", upi: "0", wallet: "0", emi: "0", paylater: "0" },
  netbanking: { card: "0", netbanking: "1", upi: "0", wallet: "0", emi: "0", paylater: "0" },
  razorpay: { card: "0", netbanking: "0", upi: "1", wallet: "1", emi: "0", paylater: "0" },
};

interface Props {
  /** Button label for the demo/offline path, e.g. "Checkout", "Book now", "Pay ₹500". */
  label: string;
  /** Whether Cash on Delivery is a valid option for what's being paid for (see COD_ELIGIBLE_CATEGORY_SLUGS). */
  codEligible?: boolean;
  onMockPay: (method: "mock" | "cod") => Promise<Order>;
  onRazorpayInit: (preferredMethod: OnlinePaymentMethod) => Promise<RazorpayCheckoutInfo>;
  onSuccess: (order: Order) => void;
}

/**
 * Renders the pay/checkout/book action for anywhere money changes hands (cart
 * checkout, direct bookings, bill payments). When the backend has real Razorpay
 * keys configured it offers Card / Net Banking / UPI & Wallet, each opening the
 * Razorpay Checkout widget restricted to that tab; Cash on Delivery is offered
 * alongside them for COD-eligible categories. Without Razorpay keys it falls back
 * to a plain one-click demo confirmation (still respecting COD where eligible).
 */
export function PaymentActions({ label, codEligible = false, onMockPay, onRazorpayInit, onSuccess }: Props) {
  const { user } = useAuth();
  const [razorpay, setRazorpay] = useState<RazorpayConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<SelectableMethod | null>(null);

  useEffect(() => {
    api.getRazorpayConfig().then(setRazorpay).catch(() => setRazorpay({ enabled: false }));
  }, []);

  const onlineAvailable = Boolean(razorpay?.enabled);
  const options: SelectableMethod[] = [
    ...(onlineAvailable ? (["razorpay", "card", "netbanking"] as OnlinePaymentMethod[]) : []),
    ...(codEligible ? (["cod"] as const) : []),
  ];

  useEffect(() => {
    setMethod((current) => (current && options.includes(current) ? current : (options[0] ?? null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineAvailable, codEligible]);

  async function handlePay() {
    setSubmitting(true);
    setError(null);
    try {
      if (method === "cod") {
        onSuccess(await onMockPay("cod"));
        return;
      }
      if (method && onlineAvailable) {
        const preferredMethod = method as OnlinePaymentMethod;
        const checkout = await onRazorpayInit(preferredMethod);
        const response = await openRazorpayCheckout({
          key: checkout.keyId,
          amount: Math.round(checkout.amount * 100),
          currency: checkout.currency,
          order_id: checkout.razorpayOrderId,
          name: "OneApp",
          description: label,
          prefill: { name: user?.name, email: user?.email, contact: user?.phone ?? undefined },
          theme: { color: "#2a5cf5" },
          method: RAZORPAY_METHOD_CONFIG[preferredMethod],
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
        return;
      }
      // Neither Razorpay nor COD is available — plain demo confirmation.
      onSuccess(await onMockPay("mock"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  const buttonLabel = submitting ? "Please wait…" : label;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {options.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Payment method</div>
          <div className="grid grid-cols-2 gap-2">
            {options.map((opt) => {
              const meta = METHOD_META[opt];
              const selected = method === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMethod(opt)}
                  aria-pressed={selected}
                  className={`text-left rounded-lg border px-3 py-2 transition ${
                    selected ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span>{meta.icon}</span>
                    {meta.title}
                  </div>
                  <div className="text-xs text-slate-500">{meta.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={submitting || (options.length > 0 && !method)}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-md py-3 font-semibold"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
