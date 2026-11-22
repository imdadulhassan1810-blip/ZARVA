import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  addressInputSchema, formatRupees, HOME_RULES, type Address, type HomePayMode, type HomeSlotDay,
} from "@zarva/core";
import { api } from "../api";
import {
  Button, Card, Chip, EmptyState, ErrorBanner, Field, haptic, Ionicons, Sheet, Skeleton, StickyFooter, Stepper, type IconName,
} from "../ui";
import { useSession } from "./CustomerApp";
import type { Nav } from "./HomeScreen";
import { CITY, useStore } from "./store";

const slotLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Cart, address, slot and payment on one screen, with the total and "Book" pinned at the bottom. */
export function CheckoutScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const { cart, lines, totals, count, setQty, clearCart, onlinePayment } = useStore();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [days, setDays] = useState<HomeSlotDay[] | null>(null);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<HomePayMode>("after_service");
  const [sheet, setSheet] = useState<"address" | "slot" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => `app-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Re-read addresses whenever this screen comes back into view (e.g. after "Add address").
  useFocusEffect(useCallback(() => {
    api.listAddresses().then((r) => {
      setAddresses(r.addresses);
      setAddressId((cur) => (cur && r.addresses.some((a) => a.id === cur) ? cur : r.addresses.find((a) => a.isDefault)?.id ?? r.addresses[0]?.id ?? null));
    }).catch((e: Error) => { setAddresses([]); setError(e.message); });
  }, []));

  useEffect(() => {
    if (!cart.categoryId) return;
    api.home.slots(CITY, cart.categoryId).then((r) => {
      setDays(r.days);
      const first = r.days.findIndex((d) => d.slots.some((s) => s.available));
      setDay(first < 0 ? 0 : first);
    }).catch((e: Error) => { setDays([]); setError(e.message); });
  }, [cart.categoryId]);

  const address = addresses?.find((a) => a.id === addressId) ?? null;

  async function book() {
    if (!addressId || !slot) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.home.createBooking({
        cityId: CITY, addressId, slotStart: slot, payMode, idempotencyKey: key,
        items: Object.entries(cart.items).map(([serviceId, qty]) => ({ serviceId, qty })),
      });
      if (r.payment) {
        const orderId = String(r.payment.clientPayload.order_id ?? "");
        if (orderId.startsWith("mock_order_")) {
          const { confirmation } = await api.mockPaymentSuccess(orderId);
          await api.home.confirmPayment(r.booking.id, confirmation);
        }
      }
      haptic.success();
      clearCart();
      nav.reset({ index: 1, routes: [{ name: "Tabs" as never }, { name: "Booking", params: { id: r.booking.id, justBooked: true } }] as never });
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (count === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center" }}>
        <EmptyState t={t} icon="cart-outline" title="Your cart is empty" body="Add a service to book a professional." action="Browse services" onAction={() => nav.navigate("Home")} />
      </View>
    );
  }

  const cta = busy ? "Booking…" : !addressId ? "Add an address" : !slot ? "Pick a time slot" : payMode === "online" ? `Pay ${formatRupees(totals.totalPaise)}` : "Confirm booking";
  const ctaPress = !addressId ? () => (addresses?.length ? setSheet("address") : nav.navigate("AddAddress")) : !slot ? () => setSheet("slot") : book;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <Card t={t} style={{ gap: 12 }}>
          {lines.map((l) => (
            <View key={l.s.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "600" }}>{l.s.name}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{formatRupees(l.s.pricePaise * l.qty)}</Text>
              </View>
              <Stepper t={t} qty={l.qty} max={HOME_RULES.maxQtyPerItem} onChange={(q) => setQty(l.s, q)} />
            </View>
          ))}
        </Card>

        <StepCard t={t} icon="location" title="Address" done={!!address}
          value={address ? `${cap(address.label)} · ${[address.line1, address.line2].filter(Boolean).join(", ")}` : addresses === null ? null : "Add where the professional should come"}
          loading={addresses === null}
          action={addresses?.length ? "Change" : "Add"} onPress={() => (addresses?.length ? setSheet("address") : nav.navigate("AddAddress"))} />

        <StepCard t={t} icon="calendar" title="Date and time" done={!!slot}
          value={slot ? slotLabel(slot) : days === null ? null : days.length === 0 ? "No slots right now" : "Pick a 1-hour arrival slot"}
          loading={days === null}
          action={slot ? "Change" : "Select"} onPress={() => setSheet("slot")} />

        <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", marginTop: 4 }}>Payment</Text>
        <View style={{ gap: 10 }}>
          {((onlinePayment ? ["after_service", "online"] : ["after_service"]) as HomePayMode[]).map((m) => (
            <Card key={m} t={t} selected={payMode === m} onPress={() => setPayMode(m)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name={m === "online" ? "card" : "cash"} size={22} color={payMode === m ? t.primary : t.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{m === "online" ? "Pay now (UPI / card)" : "Pay after service"}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{m === "online" ? "Full refund if you cancel 2+ hours before." : "Cash or UPI to the professional when the job is done."}</Text>
              </View>
              <Ionicons name={payMode === m ? "radio-button-on" : "radio-button-off"} size={22} color={payMode === m ? t.primary : t.muted} />
            </Card>
          ))}
        </View>

        <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", marginTop: 4 }}>Bill summary</Text>
        <Card t={t} style={{ gap: 8 }}>
          <Row t={t} label="Item total" value={formatRupees(totals.subtotalPaise)} />
          <Row t={t} label="Convenience fee" value={totals.feePaise > 0 ? formatRupees(totals.feePaise) : "Free"} />
          <View style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />
          <Row t={t} label="To pay" value={formatRupees(totals.totalPaise)} bold />
        </Card>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 4 }}>
          <Ionicons name="shield-checkmark" size={16} color={t.success} />
          <Text style={{ color: t.muted, fontSize: 13, flex: 1 }}>Free cancellation up to 2 hours before your slot.</Text>
        </View>
        {error && <ErrorBanner t={t} message={error} />}
      </ScrollView>

      <StickyFooter t={t}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{formatRupees(totals.totalPaise)}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{count} item{count > 1 ? "s" : ""}</Text>
          </View>
          <Button t={t} style={{ flex: 1 }} loading={busy} title={cta} onPress={() => void ctaPress()} />
        </View>
      </StickyFooter>

      <Sheet t={t} visible={sheet === "address"} onClose={() => setSheet(null)} title="Choose address">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8, gap: 10 }}>
          {(addresses ?? []).map((a) => (
            <Card key={a.id} t={t} selected={a.id === addressId} onPress={() => { setAddressId(a.id); setSheet(null); }} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Ionicons name={a.label === "work" ? "briefcase" : a.label === "home" ? "home" : "location"} size={20} color={a.id === addressId ? t.primary : t.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{cap(a.label)} · {a.name}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{[a.line1, a.line2, `${a.city} ${a.pincode}`].filter(Boolean).join(", ")}</Text>
              </View>
            </Card>
          ))}
          <Button t={t} variant="outline" icon="add" title="Add new address" onPress={() => { setSheet(null); nav.navigate("AddAddress"); }} />
        </ScrollView>
      </Sheet>

      <SlotSheet t={t} visible={sheet === "slot"} days={days ?? []} day={day} slot={slot}
        onDay={(i) => { setDay(i); }} onClose={() => setSheet(null)}
        onPick={(s) => { setSlot(s); setSheet(null); }} />
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ t, label, value, bold }: { t: ReturnType<typeof useSession>["t"]; label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: bold ? t.text : t.muted, fontWeight: bold ? "800" : "400", fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color: t.text, fontWeight: bold ? "800" : "600", fontSize: bold ? 16 : 14 }}>{value}</Text>
    </View>
  );
}

function StepCard({ t, icon, title, value, done, loading, action, onPress }: {
  t: ReturnType<typeof useSession>["t"]; icon: IconName; title: string; value: string | null; done: boolean; loading?: boolean; action: string; onPress: () => void;
}) {
  return (
    <Card t={t} onPress={loading ? undefined : onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: done ? (t.dark ? "#14352A" : "#E2F7EE") : t.surface2, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={done ? "checkmark" : icon} size={20} color={done ? t.success : t.text} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: t.text, fontWeight: "700" }}>{title}</Text>
        {loading ? <Skeleton t={t} w="70%" h={12} /> : <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{value}</Text>}
      </View>
      {!loading && <Text style={{ color: t.primary, fontWeight: "800" }}>{action}</Text>}
    </Card>
  );
}

/** Date strip plus 1-hour slot grid, in a bottom sheet. Only days and slots the server offers are shown. */
function SlotSheet({ t, visible, days, day, slot, onDay, onPick, onClose }: {
  t: ReturnType<typeof useSession>["t"]; visible: boolean; days: HomeSlotDay[]; day: number; slot: string | null;
  onDay: (i: number) => void; onPick: (s: string) => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(slot);
  useEffect(() => { if (visible) setPicked(slot); }, [visible, slot]);
  const d = days[day];
  return (
    <Sheet t={t} visible={visible} onClose={onClose} title="When should the professional arrive?">
      {days.length === 0 ? (
        <EmptyState t={t} icon="calendar-outline" title="No slots available" body="Please try again in a little while." />
      ) : (
        <View style={{ gap: 14, paddingTop: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
            {days.map((x, i) => {
              const on = i === day;
              const full = !x.slots.some((s) => s.available);
              const dt = new Date(`${x.date}T12:00:00+05:30`);
              return (
                <Pressable key={x.date} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: full }} accessibilityLabel={x.label}
                  disabled={full} onPress={() => { haptic.tap(); onDay(i); setPicked(null); }}
                  style={{ width: 64, paddingVertical: 10, borderRadius: 14, alignItems: "center", gap: 2, borderWidth: on ? 2 : 1, borderColor: on ? t.primary : t.border, backgroundColor: on ? (t.dark ? "#2B2150" : "#F1EAFF") : t.surface, opacity: full ? 0.4 : 1 }}>
                  <Text style={{ color: on ? t.primary : t.muted, fontSize: 12, fontWeight: "700" }}>{dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).toUpperCase()}</Text>
                  <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{dt.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" })}</Text>
                  <Text style={{ color: t.muted, fontSize: 11 }}>{dt.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={{ color: t.text, fontWeight: "700", paddingHorizontal: 20 }}>Arrival time · {d?.label}</Text>
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 }}>
            {d?.slots.map((s) => (
              <View key={s.start} style={{ width: "31%" }}>
                <Chip t={t} label={s.label} on={picked === s.start} disabled={!s.available} onPress={() => setPicked(s.start)} />
              </View>
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
            <Button t={t} title={picked ? `Confirm ${slotLabel(picked)}` : "Pick a time"} disabled={!picked} onPress={() => picked && onPick(picked)} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

/** New address form, opened as a modal from checkout. */
export function AddAddressScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const [d, setD] = useState({ name: "", phone: "", line1: "", line2: "", landmark: "", pincode: "" });
  const [label, setLabel] = useState<"home" | "work" | "other">("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = (k: keyof typeof d, lbl: string, extra: Record<string, unknown> = {}) => (
    <Field t={t} label={lbl} value={d[k]} onChangeText={(v: string) => setD({ ...d, [k]: v })} {...extra} />
  );
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["home", "work", "other"] as const).map((l) => <Chip key={l} t={t} label={cap(l)} on={label === l} onPress={() => setLabel(l)} />)}
        </View>
        {f("line1", "House / flat, street", { icon: "home-outline", autoComplete: "street-address" })}
        {f("line2", "Area / locality", { placeholder: "e.g. Benachity, City Centre" })}
        {f("landmark", "Landmark (optional)")}
        {f("pincode", "PIN code", { keyboardType: "number-pad", maxLength: 6, placeholder: "7132xx" })}
        {f("name", "Contact name", { icon: "person-outline", autoComplete: "name" })}
        {f("phone", "Contact phone", { keyboardType: "phone-pad", prefix: "+91", autoComplete: "tel" })}
        <Text style={{ color: t.muted, fontSize: 13 }}>We serve Durgapur now. Asansol and Kolkata soon.</Text>
        {error && <ErrorBanner t={t} message={error} />}
      </ScrollView>
      <StickyFooter t={t}>
        <Button t={t} loading={busy} title="Save address" onPress={async () => {
          const p = addressInputSchema.safeParse({ ...d, label, line2: d.line2 || null, landmark: d.landmark || null, city: "Durgapur", state: "West Bengal" });
          if (!p.success) { haptic.error(); return setError(p.error.issues[0]?.message ?? "Check the address"); }
          setBusy(true);
          try { await api.addAddress(p.data); haptic.success(); nav.goBack(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}
