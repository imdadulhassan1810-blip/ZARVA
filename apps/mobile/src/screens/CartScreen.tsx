import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Order } from "@oneapp/shared";
import { COD_ELIGIBLE_CATEGORY_SLUGS } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import { PaymentActions } from "../components/PaymentActions";

type Props = NativeStackScreenProps<RootStackParamList, "Cart">;

export function CartScreen({ navigation }: Props) {
  const { items, updateQuantity, removeItem, refresh } = useCart();

  const total = items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
  // Mirrors the backend, which prices/validates COD against the first item's category.
  const codEligible = items.length > 0 && COD_ELIGIBLE_CATEGORY_SLUGS.includes(items[0].listing.categorySlug);

  async function handleSuccess(order: Order) {
    await refresh();
    // Food orders get a live delivery-tracking journey — take the customer straight there.
    if (order.details.tracking) {
      navigation.navigate("Tracking", { orderId: order.id });
    } else {
      navigation.navigate("Orders");
    }
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyText}>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowEmoji}>{item.listing.imageEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.listing.title}</Text>
              <Text style={styles.rowPrice}>
                ₹{item.listing.price.toLocaleString("en-IN")} {item.listing.priceUnit}
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable style={styles.stepperBtn} onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{item.quantity}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(item.id)}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN")}</Text>
        </View>
        <PaymentActions
          label="Checkout"
          codEligible={codEligible}
          onMockPay={(method) => api.checkoutCart(undefined, method === "cod" ? "cod" : "mock")}
          onRazorpayInit={(preferredMethod) => api.checkoutCartWithRazorpay(undefined, preferredMethod)}
          onSuccess={handleSuccess}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  rowEmoji: { fontSize: 26 },
  rowTitle: { fontWeight: "700", fontSize: 13, color: colors.text },
  rowPrice: { fontSize: 11, color: colors.muted },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  stepperBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  stepperBtnText: { fontSize: 16 },
  stepperValue: { fontSize: 13, fontWeight: "700", paddingHorizontal: 4 },
  remove: { fontSize: 16, color: colors.muted, paddingHorizontal: 4 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, gap: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.muted },
  totalValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  error: { color: colors.danger, fontSize: 12 },
  checkoutButton: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  checkoutText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.bg },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: colors.muted },
});
