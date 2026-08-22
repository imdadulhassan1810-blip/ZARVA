import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Order, OnlinePaymentMethod, RazorpayCheckoutInfo, RazorpayConfig } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { RazorpayCheckoutModal, RazorpaySuccessResponse } from "./RazorpayCheckoutModal";
import { colors } from "../theme";

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
  label: string;
  /** Whether Cash on Delivery is a valid option for what's being paid for. */
  codEligible?: boolean;
  onMockPay: (method: "mock" | "cod") => Promise<Order>;
  onRazorpayInit: (preferredMethod: OnlinePaymentMethod) => Promise<RazorpayCheckoutInfo>;
  onSuccess: (order: Order) => void;
}

export function PaymentActions({ label, codEligible = false, onMockPay, onRazorpayInit, onSuccess }: Props) {
  const { user } = useAuth();
  const [razorpay, setRazorpay] = useState<RazorpayConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<SelectableMethod | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<RazorpayCheckoutInfo | null>(null);

  useEffect(() => {
    api
      .getRazorpayConfig()
      .then(setRazorpay)
      .catch(() => setRazorpay({ enabled: false }));
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
        setSubmitting(false);
        return;
      }
      if (method && onlineAvailable) {
        setPendingCheckout(await onRazorpayInit(method as OnlinePaymentMethod));
        return;
      }
      onSuccess(await onMockPay("mock"));
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  async function handleRazorpaySuccess(response: RazorpaySuccessResponse) {
    setPendingCheckout(null);
    if (!pendingCheckout) return;
    try {
      const verified = await api.verifyRazorpayPayment({
        orderId: pendingCheckout.order.id,
        ...response,
      });
      onSuccess(verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRazorpayDismiss() {
    setPendingCheckout(null);
    setSubmitting(false);
    setError("Payment cancelled. Your order is still pending — you can try again.");
  }

  return (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {options.length > 0 && (
        <View style={styles.optionsWrap}>
          {options.map((opt) => {
            const meta = METHOD_META[opt];
            const selected = method === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setMethod(opt)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={styles.optionTitle}>
                  {meta.icon} {meta.title}
                </Text>
                <Text style={styles.optionHint}>{meta.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable style={styles.button} onPress={handlePay} disabled={submitting || (options.length > 0 && !method)}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
      </Pressable>

      {pendingCheckout && method && method !== "cod" && (
        <RazorpayCheckoutModal
          visible
          keyId={pendingCheckout.keyId}
          amount={Math.round(pendingCheckout.amount * 100)}
          currency={pendingCheckout.currency}
          razorpayOrderId={pendingCheckout.razorpayOrderId}
          name="OneApp"
          description={label}
          prefill={{ name: user?.name, email: user?.email, contact: user?.phone ?? undefined }}
          method={RAZORPAY_METHOD_CONFIG[method as OnlinePaymentMethod]}
          onSuccess={handleRazorpaySuccess}
          onDismiss={handleRazorpayDismiss}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  optionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  option: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  optionTitle: { fontSize: 12, fontWeight: "700", color: colors.text },
  optionHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  button: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
});
