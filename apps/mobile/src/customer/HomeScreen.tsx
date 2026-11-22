import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { setStatusBarStyle } from "expo-status-bar";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { verticalIds, verticals } from "@zarva/brand";
import { formatRupees, type HomeService } from "@zarva/core";
import { Glow } from "../Glow";
import {
  Card, ConfirmSheet, EmptyState, ErrorBanner, haptic, IconTile, Ionicons, SectionTitle, Sheet, Skeleton, type IconName,
} from "../ui";
import { useSession, type CustomerStackParams, type CustomerTabParams } from "./CustomerApp";
import { CartBar, ServiceRow } from "./CategoryScreen";
import { useStore } from "./store";

export type Nav = NativeStackNavigationProp<CustomerStackParams & CustomerTabParams>;

const CITIES = [
  { name: "Durgapur", live: true },
  { name: "Asansol", live: false },
  { name: "Kolkata", live: false },
];

export function HomeScreen() {
  const { t, user } = useSession();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { categories, services, catalogError, reloadCatalog, setQty, priceOf } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [pending, setPending] = useState<{ s: HomeService; qty: number } | null>(null);

  const fromPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) m.set(s.categoryId, Math.min(m.get(s.categoryId) ?? Infinity, priceOf(s)));
    return m;
  }, [services]);
  const popular = useMemo(() => (categories ?? []).flatMap((c) => services.find((s) => s.categoryId === c.id) ?? []).slice(0, 8), [categories, services]);
  const query = q.trim().toLowerCase();
  const results = query ? services.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(query)).slice(0, 20) : [];
  const catIndex = (id: string) => Math.max(0, (categories ?? []).findIndex((c) => c.id === id));
  const firstName = user?.name?.split(" ")[0];

  // The ink header needs light status-bar icons; other screens go back to the theme default.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle("light");
    return () => setStatusBarStyle(t.dark ? "light" : "dark");
  }, [t.dark]));

  const change = (s: HomeService, qty: number) => { if (!setQty(s, qty)) setPending({ s, qty }); };
  const openCat = (id: string) => {
    const c = categories?.find((x) => x.id === id);
    if (c) nav.navigate("Category", { categoryId: c.id, title: c.name });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#fff" colors={[t.primary]} progressViewOffset={insets.top}
          onRefresh={async () => { setRefreshing(true); await reloadCatalog(); setRefreshing(false); }} />}
      >
        {/* Ink header: location, greeting, search. */}
        <View style={{ backgroundColor: t.ink, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden", gap: 14 }}>
          <Glow t={t} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Change city" onPress={() => { haptic.tap(); setCityOpen(true); }} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
              <Ionicons name="location" size={22} color={t.homeFrom} />
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>Durgapur</Text>
                  <Ionicons name="chevron-down" size={16} color="#fff" />
                </View>
                <Text style={{ color: "#B9B4D6", fontSize: 12 }}>West Bengal</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => { haptic.tap(); nav.navigate("Account"); }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
              {firstName ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>{firstName[0]!.toUpperCase()}</Text> : <Ionicons name="person" size={20} color="#fff" />}
            </Pressable>
          </View>
          <View style={{ gap: 4, marginTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3FD08F" }} />
              <Text style={{ color: "#FFD27A", fontWeight: "700", fontSize: 13 }}>Now live in Durgapur</Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 32 }}>
              {firstName ? `Hi ${firstName}, what needs fixing?` : "Home services you can trust"}
            </Text>
            <Text style={{ color: "#CFCAE8" }}>Verified professionals. Fixed prices, shown before you book.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, minHeight: 50 }}>
            <Ionicons name="search" size={20} color="#6E6A85" />
            <TextInput
              value={q} onChangeText={setQ} placeholder="Search for 'AC service' or 'plumber'" placeholderTextColor="#8A86A0"
              returnKeyType="search" accessibilityLabel="Search services"
              style={[{ flex: 1, color: "#0F0B24", fontSize: 16, paddingVertical: 12 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
            />
            {q ? <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQ("")}><Ionicons name="close-circle" size={20} color="#8A86A0" /></Pressable> : null}
          </View>
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          {catalogError && <ErrorBanner t={t} message={catalogError} onRetry={() => void reloadCatalog()} />}

          {user && !user.phone && (
            <Card t={t} onPress={() => nav.navigate("Account")} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="call" size={22} color={t.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>Add your mobile number</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>Needed to book. Professionals call before they arrive.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            </Card>
          )}

          {query ? (
            <>
              <SectionTitle t={t} title={`Results for "${q.trim()}"`} />
              {results.length === 0
                ? <EmptyState t={t} icon="search" title="No matching service" body="Try 'fan', 'tap', 'cleaning' or 'haircut'." />
                : results.map((s) => <ServiceRow key={s.id} s={s} onChange={change} />)}
            </>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {([["shield-checkmark", "Verified pros"], ["pricetag", "Fixed prices"], ["refresh-circle", "Free reschedule"], ["card", "Secure online payment"]] as [IconName, string][]).map(([icon, label]) => (
                  <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
                    <Ionicons name={icon} size={16} color={t.success} />
                    <Text style={{ color: t.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
                  </View>
                ))}
              </ScrollView>

              <SectionTitle t={t} title="What do you need?" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
                {categories === null
                  ? Array.from({ length: 6 }, (_, i) => (
                    <View key={i} style={{ width: "33.33%", padding: 5 }}>
                      <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 12, alignItems: "center", gap: 8 }}>
                        <Skeleton t={t} w={56} h={56} r={17} /><Skeleton t={t} w="80%" h={12} /><Skeleton t={t} w="50%" h={10} />
                      </View>
                    </View>
                  ))
                  : categories.map((c, i) => (
                    <View key={c.id} style={{ width: "33.33%", padding: 5 }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={c.name} onPress={() => { haptic.tap(); openCat(c.id); }}
                        style={({ pressed }) => [{ backgroundColor: t.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6, alignItems: "center", gap: 8, minHeight: 132, borderWidth: t.dark ? 1 : 0, borderColor: t.border, transform: [{ scale: pressed ? 0.96 : 1 }] }, t.shadow]}>
                        <IconTile t={t} emoji={c.icon} index={i} />
                        <Text style={{ color: t.text, fontWeight: "700", fontSize: 13, textAlign: "center" }} numberOfLines={2}>{c.name}</Text>
                        {fromPrice.has(c.id) && <Text style={{ color: t.muted, fontSize: 12 }}>from {formatRupees(fromPrice.get(c.id)!)}</Text>}
                      </Pressable>
                    </View>
                  ))}
              </View>

              {popular.length > 0 && (
                <>
                  <SectionTitle t={t} title="Popular in Durgapur" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={232} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginRight: -16 }}>
                    {popular.map((s) => {
                      const i = catIndex(s.categoryId);
                      return (
                        <Pressable key={s.id} accessibilityRole="button" onPress={() => { haptic.tap(); openCat(s.categoryId); }}
                          style={({ pressed }) => [{ width: 220, backgroundColor: t.surface, borderRadius: 18, overflow: "hidden", borderWidth: t.dark ? 1 : 0, borderColor: t.border, opacity: pressed ? 0.9 : 1 }, t.shadow]}>
                          <View style={{ height: 96, backgroundColor: t.tints[i % t.tints.length], alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 44 }}>{categories?.[i]?.icon}</Text>
                          </View>
                          <View style={{ padding: 12, gap: 4 }}>
                            <Text style={{ color: t.text, fontWeight: "700" }} numberOfLines={1}>{s.name}</Text>
                            <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>{s.durationMin} min · {categories?.[i]?.name}</Text>
                            <Text style={{ color: t.text, fontWeight: "800", marginTop: 2 }}>{formatRupees(priceOf(s))}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <SectionTitle t={t} title="How it works" />
              <Card t={t} style={{ gap: 14 }}>
                {[
                  ["Pick a service", "See the full price before you book."],
                  ["Choose a time", "1-hour slots, from 2 hours ahead."],
                  ["A verified pro arrives", "Share your start code so only your pro can begin."],
                  ["Pay after the job", "Cash or UPI, or pay online when you book."],
                ].map(([h, b], i) => (
                  <View key={h} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.home, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: t.onHome, fontWeight: "800" }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontWeight: "700" }}>{h}</Text>
                      <Text style={{ color: t.muted, fontSize: 13 }}>{b}</Text>
                    </View>
                  </View>
                ))}
              </Card>

              <SectionTitle t={t} title="More on ZARVA" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
                {verticalIds.filter((id) => id !== "home").map((id) => (
                  <View key={id} style={{ width: "50%", padding: 5 }}>
                    <View style={{ backgroundColor: t.surface, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: t.border }}>
                      <View style={{ width: 6, alignSelf: "stretch", borderRadius: 3, backgroundColor: verticals[id].flat }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontWeight: "700" }} numberOfLines={1}>{verticals[id].label}</Text>
                        <Text style={{ color: t.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 }}>COMING SOON</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <CartBar tabBar />

      <Sheet t={t} visible={cityOpen} onClose={() => setCityOpen(false)} title="Your city">
        <View style={{ paddingHorizontal: 20, paddingVertical: 8, gap: 8 }}>
          {CITIES.map((c) => (
            <Pressable key={c.name} disabled={!c.live} onPress={() => setCityOpen(false)} accessibilityRole="radio" accessibilityState={{ checked: c.live, disabled: !c.live }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 14, borderWidth: c.live ? 2 : 1, borderColor: c.live ? t.primary : t.border, opacity: c.live ? 1 : 0.6 }}>
              <Ionicons name={c.live ? "location" : "location-outline"} size={20} color={c.live ? t.primary : t.muted} />
              <Text style={{ color: t.text, fontWeight: "700", flex: 1, fontSize: 16 }}>{c.name}</Text>
              <Text style={{ color: c.live ? t.success : t.muted, fontWeight: "700", fontSize: 13 }}>{c.live ? "Live" : "Coming soon"}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
      <ConfirmSheet t={t} visible={pending !== null} onClose={() => setPending(null)}
        title="Start a new cart?" body="Your cart has a different type of service. One booking covers one type of service."
        confirm="Start new cart" cancel="Keep my cart"
        onConfirm={() => { if (pending) setQty(pending.s, pending.qty, true); }} />
    </View>
  );
}
