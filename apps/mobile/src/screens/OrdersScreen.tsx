import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { colors } from "../theme";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#2563eb",
  completed: "#059669",
  cancelled: "#dc2626",
};

type Props = NativeStackScreenProps<RootStackParamList, "Orders">;

export function OrdersScreen({ navigation }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;

  if (orders.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>📦</Text>
        <Text style={styles.emptyText}>No orders yet — go book or buy something!</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={orders}
      keyExtractor={(o) => o.id}
      renderItem={({ item: order }) => {
        const category = CATEGORY_BY_SLUG[order.categorySlug];
        return (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.headerText}>
                {category?.icon ?? "🧾"} {category?.name ?? order.categorySlug}
              </Text>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[order.status] ?? colors.muted) + "22" }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[order.status] ?? colors.muted }]}>
                  {order.status}
                </Text>
              </View>
            </View>
            {order.items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemText}>
                  {item.listingTitle} × {item.quantity}
                </Text>
                <Text style={styles.itemText}>₹{(item.unitPrice * item.quantity).toLocaleString("en-IN")}</Text>
              </View>
            ))}
            <View style={styles.footerRow}>
              <Text style={styles.date}>{new Date(order.createdAt).toLocaleString()}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {Boolean(order.details.tracking) && (
                  <Pressable onPress={() => navigation.navigate("Tracking", { orderId: order.id })}>
                    <Text style={styles.trackLink}>
                      {order.status === "completed" ? "View trip" : "Track live 🔴"}
                    </Text>
                  </Pressable>
                )}
                <Text style={styles.total}>₹{order.total.toLocaleString("en-IN")}</Text>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, gap: 6 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerText: { fontWeight: "700", fontSize: 14, color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemText: { fontSize: 12, color: colors.muted },
  footerRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  date: { fontSize: 11, color: colors.muted },
  total: { fontWeight: "800", color: colors.text },
  trackLink: { fontSize: 12, fontWeight: "700", color: colors.success },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.bg },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: colors.muted },
});
