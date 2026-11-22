import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { formatRupees, HOME_RULES, type HomeService } from "@zarva/core";
import { Button, ConfirmSheet, EmptyState, haptic, IconTile, Ionicons, SkeletonCard, Sheet, Stepper } from "../ui";
import { useSession, type CustomerStackParams } from "./CustomerApp";
import type { Nav } from "./HomeScreen";
import { useStore } from "./store";
import { CategoryRatings } from "./HelpScreens";

/** One category's services, each with an ADD stepper, and the cart bar at the bottom. */
export function CategoryScreen() {
  const { t } = useSession();
  const { params } = useRoute<RouteProp<CustomerStackParams, "Category">>();
  const { categories, services, reloadCatalog, setQty } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<{ s: HomeService; qty: number } | null>(null);
  const idx = Math.max(0, (categories ?? []).findIndex((c) => c.id === params.categoryId));
  const cat = categories?.[idx];
  const list = services.filter((s) => s.categoryId === params.categoryId);
  const change = (s: HomeService, qty: number) => { if (!setQty(s, qty)) setPending({ s, qty }); };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reloadCatalog(); setRefreshing(false); }} />}>
        {cat && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <IconTile t={t} emoji={cat.icon} index={idx} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.muted }}>{cat.description}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Ionicons name="shield-checkmark" size={14} color={t.success} />
                <Text style={{ color: t.success, fontWeight: "700", fontSize: 13 }}>Verified pros · fixed prices</Text>
              </View>
            </View>
          </View>
        )}
        {categories === null
          ? [0, 1, 2].map((i) => <SkeletonCard key={i} t={t} lines={4} />)
          : list.length === 0
            ? <EmptyState t={t} icon="construct-outline" title="No services here yet" body="Pull down to refresh." />
            : list.map((s) => <ServiceRow key={s.id} s={s} onChange={change} />)}
        {cat && <CategoryRatings slug={cat.slug} />}
      </ScrollView>
      <CartBar />
      <ConfirmSheet t={t} visible={pending !== null} onClose={() => setPending(null)}
        title="Start a new cart?" body="Your cart has a different type of service. One booking covers one type of service."
        confirm="Start new cart" cancel="Keep my cart"
        onConfirm={() => { if (pending) setQty(pending.s, pending.qty, true); }} />
    </View>
  );
}

/** A service with price, duration, a "details" sheet and the ADD stepper. */
export function ServiceRow({ s, onChange }: { s: HomeService; onChange: (s: HomeService, qty: number) => void }) {
  const { t } = useSession();
  const { cart } = useStore();
  const [open, setOpen] = useState(false);
  const qty = cart.items[s.id] ?? 0;
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: 16, padding: 16, flexDirection: "row", gap: 12, borderWidth: t.dark ? 1 : 0, borderColor: t.border }, t.shadow]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{s.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{formatRupees(s.pricePaise)}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>· {s.durationMin} min</Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{s.description}</Text>
        {s.inclusions.length > 0 && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { haptic.tap(); setOpen(true); }} style={{ marginTop: 4 }}>
            <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>What&apos;s included</Text>
          </Pressable>
        )}
      </View>
      <View style={{ justifyContent: "center" }}>
        <Stepper t={t} qty={qty} max={HOME_RULES.maxQtyPerItem} onChange={(q) => onChange(s, q)} />
      </View>
      <Sheet t={t} visible={open} onClose={() => setOpen(false)} title={s.name}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8, gap: 12 }}>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>{formatRupees(s.pricePaise)} <Text style={{ color: t.muted, fontSize: 15, fontWeight: "500" }}>· {s.durationMin} min</Text></Text>
          <Text style={{ color: t.muted }}>{s.description}</Text>
          {s.inclusions.map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Ionicons name="checkmark-circle" size={20} color={t.success} />
              <Text style={{ color: t.text, flex: 1 }}>{i}</Text>
            </View>
          ))}
          <Button t={t} title={qty ? "Done" : "Add to cart"} onPress={() => { if (!qty) onChange(s, 1); setOpen(false); }} style={{ marginTop: 8 }} />
        </ScrollView>
      </Sheet>
    </View>
  );
}

/** "2 items · ₹598  View cart" pinned above the tab bar or the screen bottom. */
export function CartBar({ tabBar }: { tabBar?: boolean }) {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const { count, totals } = useStore();
  if (count === 0) return null;
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: tabBar ? 10 : 24, paddingTop: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View cart, ${count} items, ${formatRupees(totals.totalPaise)}`}
        onPress={() => { haptic.impact(); nav.navigate("Checkout"); }}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.primary, transform: [{ scale: pressed ? 0.98 : 1 }] }, t.shadow]}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="cart" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>{count} item{count > 1 ? "s" : ""} · {formatRupees(totals.totalPaise)}</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{totals.feePaise > 0 ? `Incl. ${formatRupees(totals.feePaise)} convenience fee` : "No convenience fee"}</Text>
        </View>
        <Text style={{ color: "#fff", fontWeight: "800" }}>View cart</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}
