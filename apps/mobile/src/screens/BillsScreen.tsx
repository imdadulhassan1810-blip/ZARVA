import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BILLER_TYPES } from "@oneapp/shared";
import type { Bill } from "@oneapp/shared";
import { api } from "../lib/api";
import { colors } from "../theme";
import { PaymentActions } from "../components/PaymentActions";

export function BillsScreen() {
  const [billerType, setBillerType] = useState<string>(BILLER_TYPES[0].slug);
  const [consumerNumber, setConsumerNumber] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLookup() {
    if (!consumerNumber) return;
    setError(null);
    setBill(null);
    setPaid(false);
    setLoading(true);
    try {
      setBill(await api.lookupBill(billerType, consumerNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🧾 Bill Payments</Text>
      <Text style={styles.subtitle}>Electricity, water, mobile, DTH, broadband & credit card.</Text>

      <Text style={styles.label}>Biller</Text>
      <View style={styles.billerRow}>
        {BILLER_TYPES.map((b) => (
          <Pressable
            key={b.slug}
            style={[styles.billerChip, billerType === b.slug && styles.billerChipActive]}
            onPress={() => {
              setBillerType(b.slug);
              setBill(null);
              setPaid(false);
            }}
          >
            <Text style={[styles.billerChipText, billerType === b.slug && styles.billerChipTextActive]}>
              {b.icon} {b.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Consumer / account number</Text>
      <TextInput
        style={styles.input}
        value={consumerNumber}
        onChangeText={setConsumerNumber}
        placeholder="e.g. 1234567890"
      />

      <Pressable style={styles.fetchButton} onPress={onLookup} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fetchButtonText}>Fetch bill</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {bill && (
        <View style={styles.billCard}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Biller</Text>
            <Text style={styles.billValue}>{bill.billerName}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Consumer no.</Text>
            <Text style={styles.billValue}>{bill.consumerNumber}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Due date</Text>
            <Text style={styles.billValue}>{new Date(bill.dueDate).toLocaleDateString()}</Text>
          </View>
          <View style={[styles.billRow, styles.amountRow]}>
            <Text style={styles.amountLabel}>Amount due</Text>
            <Text style={styles.amountValue}>₹{bill.amountDue.toLocaleString("en-IN")}</Text>
          </View>

          {paid ? (
            <Text style={styles.paidText}>✅ Payment successful!</Text>
          ) : (
            <PaymentActions
              label={`Pay ₹${bill.amountDue.toLocaleString("en-IN")}`}
              onMockPay={() =>
                api.payBill({
                  billerType: bill.billerType,
                  billerName: bill.billerName,
                  consumerNumber: bill.consumerNumber,
                  amount: bill.amountDue,
                })
              }
              onRazorpayInit={() =>
                api.payBillWithRazorpay({
                  billerType: bill.billerType,
                  billerName: bill.billerName,
                  consumerNumber: bill.consumerNumber,
                  amount: bill.amountDue,
                })
              }
              onSuccess={() => setPaid(true)}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 6 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  label: { fontWeight: "600", fontSize: 13, color: colors.text, marginTop: 10, marginBottom: 6 },
  billerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  billerChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
  billerChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  billerChipText: { fontSize: 12, color: colors.text },
  billerChipTextActive: { color: "#fff", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: colors.card,
  },
  fetchButton: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  fetchButtonText: { color: "#fff", fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
  billCard: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 16, gap: 8 },
  billRow: { flexDirection: "row", justifyContent: "space-between" },
  billLabel: { color: colors.muted, fontSize: 12 },
  billValue: { fontWeight: "600", fontSize: 12, color: colors.text },
  amountRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  amountLabel: { fontWeight: "700", color: colors.text },
  amountValue: { fontSize: 18, fontWeight: "800", color: colors.brand },
  paidText: { textAlign: "center", color: colors.success, fontWeight: "700", marginTop: 6 },
  payButton: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 },
  payButtonText: { color: "#fff", fontWeight: "800" },
});
