import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AdminOrder, AdminStats, AdminUser, OrderStatus } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

const ORDER_STATUSES: OrderStatus[] = ["pending_payment", "confirmed", "completed", "cancelled"];

type Tab = "overview" | "users" | "orders";

/** Admin-only console: platform stats, every user account (activate/deactivate), and every
 *  order across every user (status changes). The server independently enforces admin access
 *  on every request — this screen is a convenience UI, not the security boundary. */
export function AdminScreen() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, u, o] = await Promise.all([api.adminStats(), api.adminListUsers(), api.adminListOrders()]);
        setStats(s);
        setUsers(u);
        setOrders(o);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    setError(null);
    try {
      const updated = await api.adminSetUserActive(u.id, !u.isActive);
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that user");
    } finally {
      setBusyId(null);
    }
  }

  async function cycleStatus(o: AdminOrder) {
    const next = ORDER_STATUSES[(ORDER_STATUSES.indexOf(o.status) + 1) % ORDER_STATUSES.length];
    setBusyId(o.id);
    setError(null);
    try {
      const updated = await api.adminSetOrderStatus(o.id, next);
      setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that order");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(["overview", "users", "orders"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "overview" && stats && (
          <View style={{ gap: 12 }}>
            <View style={styles.statGrid}>
              <StatCard label="Total users" value={String(stats.totalUsers)} />
              <StatCard label="Active users" value={String(stats.activeUsers)} />
              <StatCard label="Total orders" value={String(stats.totalOrders)} />
              <StatCard label="Revenue" value={`₹${stats.totalRevenue.toLocaleString("en-IN")}`} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Orders by status</Text>
              {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                <View key={status} style={styles.rowBetween}>
                  <Text style={styles.muted}>{status}</Text>
                  <Text style={styles.value}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === "users" &&
          users.map((u) => (
            <View key={u.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{u.name}</Text>
                <View style={[styles.badge, u.isActive ? styles.badgeGreen : styles.badgeRed]}>
                  <Text style={styles.badgeText}>{u.isActive ? "active" : "deactivated"}</Text>
                </View>
              </View>
              <Text style={styles.muted}>{u.email}</Text>
              <Text style={styles.muted}>
                {u.orderCount} orders · ₹{u.totalSpent.toLocaleString("en-IN")} spent {u.role === "admin" ? "· admin" : ""}
              </Text>
              <Pressable
                onPress={() => toggleActive(u)}
                disabled={busyId === u.id || u.id === me?.id}
                style={[styles.actionButton, u.isActive ? styles.actionDanger : styles.actionSuccess, (busyId === u.id || u.id === me?.id) && styles.actionDisabled]}
              >
                <Text style={u.isActive ? styles.actionDangerText : styles.actionSuccessText}>
                  {u.id === me?.id ? "This is you" : u.isActive ? "Deactivate" : "Reactivate"}
                </Text>
              </Pressable>
            </View>
          ))}

        {tab === "orders" &&
          orders.map((o) => {
            const category = CATEGORY_BY_SLUG[o.categorySlug];
            return (
              <View key={o.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>
                    {category?.icon ?? "🧾"} {category?.name ?? o.categorySlug}
                  </Text>
                  <Text style={styles.value}>₹{o.total.toLocaleString("en-IN")}</Text>
                </View>
                <Text style={styles.muted}>
                  {o.userName} · {o.userEmail}
                </Text>
                <Text style={styles.muted}>
                  {o.paymentMethod.toUpperCase()} · {new Date(o.createdAt).toLocaleString()}
                </Text>
                <Pressable
                  onPress={() => cycleStatus(o)}
                  disabled={busyId === o.id}
                  style={[styles.actionButton, styles.actionNeutral, busyId === o.id && styles.actionDisabled]}
                >
                  <Text style={styles.actionNeutralText}>Status: {o.status} (tap to advance)</Text>
                </Pressable>
              </View>
            );
          })}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { fontSize: 13, color: colors.muted, textTransform: "capitalize" },
  tabTextActive: { color: colors.brand, fontWeight: "700" },
  content: { padding: 16, gap: 10 },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  statLabel: { fontSize: 11, color: colors.muted },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  cardTitle: { fontWeight: "700", fontSize: 13, color: colors.text },
  muted: { fontSize: 11, color: colors.muted },
  value: { fontWeight: "700", fontSize: 13, color: colors.text },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeGreen: { backgroundColor: "#dcfce7" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeText: { fontSize: 10, fontWeight: "700" },
  actionButton: { borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 4 },
  actionDisabled: { opacity: 0.4 },
  actionDanger: { backgroundColor: "#fef2f2" },
  actionDangerText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  actionSuccess: { backgroundColor: "#ecfdf5" },
  actionSuccessText: { color: colors.success, fontWeight: "700", fontSize: 12 },
  actionNeutral: { backgroundColor: colors.chip },
  actionNeutralText: { color: colors.text, fontWeight: "600", fontSize: 11 },
});
