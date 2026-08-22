import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { Order, RazorpayCheckoutInfo, RazorpayConfig } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { RazorpayCheckoutModal, RazorpaySuccessResponse } from "./RazorpayCheckoutModal";
import { colors } from "../theme";

interface Props {
  label: string;
  onMockPay: () => Promise<Order>;
  onRazorpayInit: () => Promise<RazorpayCheckoutInfo>;
  onSuccess: (order: Order) => void;
}

export function PaymentActions({ label, onMockPay, onRazorpayInit, onSuccess }: Props) {
  const { user } = useAuth();
  const [razorpay, setRazorpay] = useState<RazorpayConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<RazorpayCheckoutInfo | null>(null);

  useEffect(() => {
    api
      .getRazorpayConfig()
      .then(setRazorpay)
      .catch(() => setRazorpay({ enabled: false }));
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

  async function handleRazorpayInit() {
    setSubmitting(true);
    setError(null);
    try {
      setPendingCheckout(await onRazorpayInit());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
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

      {razorpay?.enabled ? (
        <>
          <Pressable style={styles.razorpayButton} onPress={handleRazorpayInit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Pay with Razorpay</Text>}
          </Pressable>
          <Pressable onPress={handleMockPay} disabled={submitting}>
            <Text style={styles.mockLink}>or use the demo checkout instead</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.button} onPress={handleMockPay} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
        </Pressable>
      )}

      {pendingCheckout && (
        <RazorpayCheckoutModal
          visible
          keyId={pendingCheckout.keyId}
          amount={Math.round(pendingCheckout.amount * 100)}
          currency={pendingCheckout.currency}
          razorpayOrderId={pendingCheckout.razorpayOrderId}
          name="OneApp"
          description={label}
          prefill={{ name: user?.name, email: user?.email, contact: user?.phone ?? undefined }}
          onSuccess={handleRazorpaySuccess}
          onDismiss={handleRazorpayDismiss}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  razorpayButton: { backgroundColor: "#3395FF", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  mockLink: { color: colors.muted, fontSize: 11, textDecorationLine: "underline", textAlign: "center", marginTop: 8 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
});
