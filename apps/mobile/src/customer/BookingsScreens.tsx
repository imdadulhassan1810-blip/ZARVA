import { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { formatPhone, formatRupees, type HomeBooking, type HomeBookingStatus } from "@zarva/core";
import { api } from "../api";
import type { Theme } from "../theme";
import { Button, Card, ConfirmSheet, EmptyState, ErrorBanner, haptic, IconButton, Ionicons, Pill, SkeletonCard, type IconName } from "../ui";
import { useSession, type CustomerStackParams } from "./CustomerApp";
import type { Nav } from "./HomeScreen";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function statusLook(t: Theme, s: HomeBookingStatus): { color: string; icon: IconName } {
  switch (s) {
    case "completed": return { color: t.success, icon: "checkmark-circle" };
    case "cancelled": return { color: t.danger, icon: "close-circle" };
    case "pending_payment": return { color: t.warning, icon: "time" };
    case "on_the_way": return { color: t.info, icon: "bicycle" };
    case "in_progress": return { color: t.primary, icon: "construct" };
    default: return { color: t.primary, icon: "calendar" };
  }
}
const ACTIVE: HomeBookingStatus[] = ["pending_payment", "confirmed", "assigned", "on_the_way", "in_progress"];

export function BookingsScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const [list, setList] = useState<HomeBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => api.home.bookings().then((r) => { setList(r.bookings); setError(null); }).catch((e: Error) => { setError(e.message); setList((l) => l ?? []); }), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const upcoming = (list ?? []).filter((b) => ACTIVE.includes(b.status));
  const past = (list ?? []).filter((b) => !ACTIVE.includes(b.status));

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {error && <ErrorBanner t={t} message={error} onRetry={() => void load()} />}
      {list === null ? [0, 1, 2].map((i) => <SkeletonCard key={i} t={t} />)
        : list.length === 0 ? (
          <EmptyState t={t} icon="calendar-clear-outline" title="No bookings yet" body="When you book a service, you can track it here." action="Book a service" onAction={() => nav.navigate("Home")} />
        ) : (
          <>
            {upcoming.length > 0 && <Text style={{ color: t.muted, fontWeight: "700", fontSize: 13, letterSpacing: 0.6 }}>UPCOMING</Text>}
            {upcoming.map((b) => <BookingCard key={b.id} t={t} b={b} onPress={() => nav.navigate("Booking", { id: b.id })} />)}
            {past.length > 0 && <Text style={{ color: t.muted, fontWeight: "700", fontSize: 13, letterSpacing: 0.6, marginTop: 8 }}>PAST</Text>}
            {past.map((b) => <BookingCard key={b.id} t={t} b={b} onPress={() => nav.navigate("Booking", { id: b.id })} />)}
          </>
        )}
    </ScrollView>
  );
}

function BookingCard({ t, b, onPress }: { t: Theme; b: HomeBooking; onPress: () => void }) {
  const look = statusLook(t, b.status);
  return (
    <Card t={t} onPress={onPress} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pill t={t} label={b.statusLabel} color={look.color} icon={look.icon} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{b.code}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{b.categoryName}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{b.items.map((i) => i.name).join(", ")}</Text>
        </View>
        <Text style={{ color: t.text, fontWeight: "800" }}>{formatRupees(b.totalPaise)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="time-outline" size={15} color={t.muted} />
        <Text style={{ color: t.muted, fontSize: 13 }}>{when(b.slotStart)}</Text>
      </View>
    </Card>
  );
}

const STEPS: { s: HomeBookingStatus; label: string }[] = [
  { s: "confirmed", label: "Booked" },
  { s: "assigned", label: "Professional assigned" },
  { s: "on_the_way", label: "On the way" },
  { s: "in_progress", label: "Work in progress" },
  { s: "completed", label: "Completed" },
];

export function BookingScreen() {
  const { t } = useSession();
  const { params } = useRoute<RouteProp<CustomerStackParams, "Booking">>();
  const [b, setB] = useState<HomeBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const load = useCallback(() => api.home.booking(params.id).then((r) => { setB(r.booking); setError(null); }).catch((e: Error) => setError(e.message)), [params.id]);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 20_000);
    return () => clearInterval(i);
  }, [load]);

  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}>
        {error ? <ErrorBanner t={t} message={error} onRetry={() => void load()} /> : <><SkeletonCard t={t} lines={2} /><SkeletonCard t={t} lines={5} /></>}
      </View>
    );
  }
  const look = statusLook(t, b.status);
  const reached = STEPS.findIndex((x) => x.s === b.status);
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {params.justBooked && b.status !== "cancelled" && (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: 16, backgroundColor: t.dark ? "#14352A" : "#E2F7EE" }}>
          <Ionicons name="checkmark-circle" size={28} color={t.success} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>Booking confirmed</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>We&apos;ll SMS you when a professional is assigned.</Text>
          </View>
        </View>
      )}

      <Card t={t} style={{ gap: 8 }}>
        <Pill t={t} label={b.statusLabel} color={look.color} icon={look.icon} />
        <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>{b.categoryName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="time-outline" size={16} color={t.muted} />
          <Text style={{ color: t.muted }}>{new Date(b.slotStart).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 13 }}>Booking ID {b.code}</Text>
      </Card>

      {b.startCode && ["confirmed", "assigned", "on_the_way"].includes(b.status) && (
        <View style={{ borderRadius: 16, padding: 18, alignItems: "center", gap: 6, backgroundColor: t.ink }}>
          <Text style={{ color: "#CFCAE8" }}>Share this start code when the professional arrives</Text>
          <Text accessibilityLabel={`Start code ${b.startCode.split("").join(" ")}`} style={{ color: "#fff", fontSize: 36, fontWeight: "800", letterSpacing: 12 }}>{b.startCode}</Text>
          <Text style={{ color: "#8E88B0", fontSize: 12 }}>Only your professional can start the job with it.</Text>
        </View>
      )}

      {b.status !== "cancelled" && b.status !== "pending_payment" && (
        <Card t={t} style={{ gap: 0 }}>
          {STEPS.map((x, i) => {
            const done = i <= reached;
            const lastStep = i === STEPS.length - 1;
            return (
              <View key={x.s} style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: done ? t.success : t.surface2, borderWidth: done ? 0 : 2, borderColor: t.border }}>
                    {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  {!lastStep && <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: i < reached ? t.success : t.border }} />}
                </View>
                <Text style={{ color: done ? t.text : t.muted, fontWeight: i === reached ? "800" : "500", paddingBottom: lastStep ? 0 : 16, paddingTop: 1 }}>{x.label}</Text>
              </View>
            );
          })}
        </Card>
      )}

      {b.pro && (
        <Card t={t} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.home, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.onHome, fontWeight: "800", fontSize: 18 }}>{b.pro.name[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800" }}>{b.pro.name}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>Your ZARVA professional{b.pro.phone ? ` · ${formatPhone(b.pro.phone)}` : ""}</Text>
          </View>
          {b.pro.phone && <IconButton t={t} icon="call" label={`Call ${b.pro.name}`} color="#fff" bg={t.success} onPress={() => void Linking.openURL(`tel:${b.pro!.phone}`)} />}
        </Card>
      )}

      <Card t={t} style={{ gap: 8 }}>
        <Text style={{ color: t.text, fontWeight: "800" }}>Services</Text>
        {b.items.map((i) => (
          <View key={i.serviceId} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.text, flex: 1 }}>{i.name} × {i.qty}</Text>
            <Text style={{ color: t.text }}>{formatRupees(i.unitPricePaise * i.qty)}</Text>
          </View>
        ))}
        {b.feePaise > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.muted }}>Convenience fee</Text><Text style={{ color: t.muted }}>{formatRupees(b.feePaise)}</Text>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: t.text, fontWeight: "800" }}>Total</Text>
          <Text style={{ color: t.text, fontWeight: "800" }}>{formatRupees(b.totalPaise)}</Text>
        </View>
        <Text style={{ color: b.paid ? t.success : t.muted, fontWeight: "600", fontSize: 13 }}>
          {b.paid ? "Paid online" : b.payMode === "after_service" ? "Pay the professional after the service" : "Not paid"}
          {b.refundedPaise > 0 ? ` · ${formatRupees(b.refundedPaise)} refunded` : ""}
        </Text>
      </Card>

      <Card t={t} style={{ flexDirection: "row", gap: 12 }}>
        <Ionicons name="location-outline" size={20} color={t.muted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>{b.address.name}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{[b.address.line1, b.address.line2, b.address.landmark, `${b.address.city} ${b.address.pincode}`].filter(Boolean).join(", ")}</Text>
        </View>
      </Card>

      {error && <ErrorBanner t={t} message={error} />}
      {b.canCancel && <Button t={t} variant="outline" icon="close-circle-outline" title="Cancel booking" onPress={() => setConfirmCancel(true)} />}
      <ConfirmSheet t={t} visible={confirmCancel} onClose={() => setConfirmCancel(false)} destructive
        title="Cancel this booking?" body={b.paid ? "You'll get a full refund to your original payment method." : "The professional will be told not to come."}
        confirm="Yes, cancel booking" cancel="Keep booking"
        onConfirm={() => void api.home.cancel(b.id).then((r) => { haptic.success(); setB(r.booking); }).catch((e: Error) => { haptic.error(); setError(e.message); })} />
    </ScrollView>
  );
}
