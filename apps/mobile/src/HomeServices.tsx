import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { verticals } from "@zarva/brand";
import {
  addressInputSchema, formatPhone, formatRupees, homeTotals, HOME_RULES,
  type Address, type HomeBooking, type HomeCategory, type HomePayMode, type HomeService, type HomeSlotDay,
} from "@zarva/core";
import { api } from "./api";
import type { Theme } from "./theme";
import { Button, Field, Loading } from "./ui";

/**
 * Customer home-services flow on mobile: browse -> cart -> address + slot -> pay -> track.
 * Customer app only: professionals use the separate ZARVA Partner app (src/partner), admins the web admin app.
 */
type View_ =
  | { name: "categories" }
  | { name: "services"; categoryId: string }
  | { name: "checkout" }
  | { name: "address" }
  | { name: "bookings" }
  | { name: "booking"; id: string };

const CITY = "durgapur";

export function HomeServices({ t, onExit }: { t: Theme; onExit: () => void }) {
  const [stack, setStack] = useState<View_[]>([{ name: "categories" }]);
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [services, setServices] = useState<HomeService[]>([]);
  const [cart, setCart] = useState<{ categoryId: string | null; items: Record<string, number> }>({ categoryId: null, items: {} });
  const [error, setError] = useState<string | null>(null);
  const view = stack[stack.length - 1]!;
  const push = (v: View_) => setStack((s) => [...s, v]);
  const back = useCallback(() => {
    if (stack.length > 1) setStack((s) => s.slice(0, -1));
    else onExit();
    return true;
  }, [stack.length, onExit]);
  const resetTo = (v: View_) => setStack([{ name: "categories" }, v]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", back);
    return () => sub.remove();
  }, [back]);

  useEffect(() => {
    api.home.catalog(CITY).then((r) => { setCategories(r.categories); setServices(r.services); }).catch((e: Error) => setError(e.message));
  }, []);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const lines = Object.entries(cart.items).flatMap(([id, qty]) => (byId.get(id) ? [{ s: byId.get(id)!, qty, unitPricePaise: byId.get(id)!.pricePaise }] : []));
  const totals = homeTotals(lines);
  const count = lines.reduce((n, l) => n + l.qty, 0);

  function setQty(s: HomeService, qty: number) {
    const same = cart.categoryId === s.categoryId;
    const apply = () => {
      const items = same ? { ...cart.items } : {};
      if (qty <= 0) delete items[s.id];
      else items[s.id] = Math.min(qty, HOME_RULES.maxQtyPerItem);
      setCart({ categoryId: Object.keys(items).length ? s.categoryId : null, items });
    };
    if (!same && count > 0 && qty > 0) {
      Alert.alert("Start a new cart?", "Your cart has a different service type.", [{ text: "Cancel", style: "cancel" }, { text: "New cart", onPress: apply }]);
    } else apply();
  }

  const header = (title: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12}>
        <Text style={{ color: t.text, fontSize: 24 }}>←</Text>
      </Pressable>
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "600", flex: 1 }}>{title}</Text>
    </View>
  );
  const card = { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: t.radius.lg, padding: 14, gap: 4 } as const;
  const txt = { color: t.text } as const;
  const muted = { color: t.muted, fontSize: t.fontSize.sm } as const;

  const cartBar = count > 0 && (view.name === "categories" || view.name === "services") && (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderTopWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
      <View style={{ flex: 1 }}>
        <Text style={[txt, { fontWeight: "700" }]}>{count} item{count > 1 ? "s" : ""} · {formatRupees(totals.totalPaise)}</Text>
        <Text style={muted}>{totals.feePaise > 0 ? `Incl. ${formatRupees(totals.feePaise)} fee` : "No convenience fee"}</Text>
      </View>
      <Button t={t} title="Continue" onPress={() => push({ name: "checkout" })} />
    </View>
  );

  let body: React.ReactNode;
  if (view.name === "categories") {
    body = (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {header("Home services")}
        <View style={{ backgroundColor: verticals.home.flat, borderRadius: t.radius.lg, padding: 16 }}>
          <Text style={{ color: "#0F0B24", fontWeight: "700", fontSize: t.fontSize.lg }}>Durgapur</Text>
          <Text style={{ color: "#0F0B24" }}>Verified professionals at fixed prices. Asansol and Kolkata soon.</Text>
        </View>
        {error && <Text style={{ color: t.danger }}>{error}</Text>}
        {categories.length === 0 && !error && <Loading />}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {categories.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => push({ name: "services", categoryId: c.id })} style={[card, { width: "47%", minHeight: 120 }]}>
              <Text style={{ fontSize: 28 }}>{c.icon}</Text>
              <Text style={[txt, { fontWeight: "600" }]}>{c.name}</Text>
              <Text style={[muted, { fontSize: t.fontSize.xs }]} numberOfLines={2}>{c.description}</Text>
            </Pressable>
          ))}
        </View>
        <Button t={t} ghost title="Your bookings" onPress={() => push({ name: "bookings" })} />
      </ScrollView>
    );
  } else if (view.name === "services") {
    const cat = categories.find((c) => c.id === view.categoryId);
    body = (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {header(`${cat?.icon ?? ""} ${cat?.name ?? ""}`)}
        {services.filter((s) => s.categoryId === view.categoryId).map((s) => {
          const qty = cart.items[s.id] ?? 0;
          return (
            <View key={s.id} style={card}>
              <Text style={[txt, { fontWeight: "600" }]}>{s.name}</Text>
              <Text style={muted}>{s.description}</Text>
              <Text style={[txt, { fontWeight: "700", marginTop: 4 }]}>{formatRupees(s.pricePaise)} <Text style={muted}>· {s.durationMin} min</Text></Text>
              {s.inclusions.map((i) => <Text key={i} style={[muted, { fontSize: t.fontSize.xs }]}>• {i}</Text>)}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8, gap: 8, alignItems: "center" }}>
                {qty === 0 ? (
                  <Button t={t} ghost title="Add" onPress={() => setQty(s, 1)} />
                ) : (
                  <>
                    <Button t={t} ghost title="−" onPress={() => setQty(s, qty - 1)} />
                    <Text style={[txt, { fontWeight: "700", minWidth: 24, textAlign: "center" }]}>{qty}</Text>
                    <Button t={t} ghost title="+" disabled={qty >= HOME_RULES.maxQtyPerItem} onPress={() => setQty(s, qty + 1)} />
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  } else if (view.name === "checkout") {
    body = (
      <Checkout t={t} header={header("Checkout")} card={card} cart={cart} lines={lines} totals={totals}
        onAddAddress={() => push({ name: "address" })}
        onBooked={(id) => { setCart({ categoryId: null, items: {} }); resetTo({ name: "booking", id }); }} />
    );
  } else if (view.name === "address") {
    body = <AddAddress t={t} header={header("New address")} onSaved={back} />;
  } else if (view.name === "bookings") {
    body = <BookingList t={t} header={header("Your bookings")} card={card} onOpen={(id) => push({ name: "booking", id })} />;
  } else {
    body = <BookingDetail t={t} header={header("Booking")} card={card} id={view.id} />;
  }

  return <View style={{ flex: 1 }}>{body}{cartBar}</View>;
}

type Card = Record<string, unknown>;

function Checkout({ t, header, card, cart, lines, totals, onAddAddress, onBooked }: {
  t: Theme; header: React.ReactNode; card: Card;
  cart: { categoryId: string | null; items: Record<string, number> };
  lines: { s: HomeService; qty: number }[]; totals: ReturnType<typeof homeTotals>;
  onAddAddress: () => void; onBooked: (id: string) => void;
}) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [days, setDays] = useState<HomeSlotDay[]>([]);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<HomePayMode>("after_service");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => `app-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const loadAddresses = useCallback(() => api.listAddresses().then((r) => {
    setAddresses(r.addresses);
    setAddressId((cur) => cur ?? r.addresses.find((a) => a.isDefault)?.id ?? r.addresses[0]?.id ?? null);
  }), []);

  useEffect(() => {
    void loadAddresses().catch((e: Error) => setError(e.message));
    if (cart.categoryId) api.home.slots(CITY, cart.categoryId).then((r) => {
      setDays(r.days);
      const first = r.days.findIndex((d) => d.slots.some((s) => s.available));
      setDay(first < 0 ? 0 : first);
    }).catch((e: Error) => setError(e.message));
  }, [cart.categoryId, loadAddresses]);

  // Re-read addresses when coming back from "New address".
  useEffect(() => {
    const id = setInterval(() => void loadAddresses().catch(() => {}), 3000);
    return () => clearInterval(id);
  }, [loadAddresses]);

  const chip = (on: boolean, disabled = false) => ({
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: t.radius.md, borderWidth: 1,
    borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.surface, opacity: disabled ? 0.35 : 1,
  });

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
      onBooked(r.booking.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {header}
      <Text style={{ color: t.text, fontWeight: "600", fontSize: t.fontSize.lg }}>1. Address</Text>
      {addresses === null ? <Loading /> : addresses.map((a) => (
        <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ checked: addressId === a.id }} onPress={() => setAddressId(a.id)}
          style={[card, { borderColor: addressId === a.id ? t.primary : t.border, borderWidth: addressId === a.id ? 2 : 1 }]}>
          <Text style={{ color: t.text, fontWeight: "600", textTransform: "capitalize" }}>{a.label} · {a.name}</Text>
          <Text style={{ color: t.muted }}>{[a.line1, a.line2, `${a.city} ${a.pincode}`].filter(Boolean).join(", ")}</Text>
        </Pressable>
      ))}
      <Button t={t} ghost title="+ Add address" onPress={onAddAddress} />

      <Text style={{ color: t.text, fontWeight: "600", fontSize: t.fontSize.lg }}>2. Date and time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d, i) => (
          <Pressable key={d.date} onPress={() => { setDay(i); setSlot(null); }} style={chip(i === day)}>
            <Text style={{ color: i === day ? "#fff" : t.text }}>{d.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {days[day]?.slots.map((s) => (
          <Pressable key={s.start} disabled={!s.available} onPress={() => setSlot(s.start)} style={[chip(slot === s.start, !s.available), { width: "48%" }]}>
            <Text style={{ color: slot === s.start ? "#fff" : t.text, textAlign: "center" }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: t.text, fontWeight: "600", fontSize: t.fontSize.lg }}>3. Payment</Text>
      {(["after_service", "online"] as HomePayMode[]).map((m) => (
        <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: payMode === m }} onPress={() => setPayMode(m)}
          style={[card, { borderColor: payMode === m ? t.primary : t.border, borderWidth: payMode === m ? 2 : 1 }]}>
          <Text style={{ color: t.text, fontWeight: "600" }}>{m === "online" ? "Pay now (UPI / card)" : "Pay after service"}</Text>
          <Text style={{ color: t.muted }}>{m === "online" ? "Full refund if you cancel 2+ hours before." : "Cash or UPI to the professional when the job is done."}</Text>
        </Pressable>
      ))}

      <View style={card}>
        {lines.map((l) => (
          <View key={l.s.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.text, flex: 1 }}>{l.s.name} × {l.qty}</Text>
            <Text style={{ color: t.text }}>{formatRupees(l.s.pricePaise * l.qty)}</Text>
          </View>
        ))}
        {totals.feePaise > 0 && <Text style={{ color: t.muted }}>Convenience fee {formatRupees(totals.feePaise)}</Text>}
        <Text style={{ color: t.text, fontWeight: "700", marginTop: 6 }}>Total {formatRupees(totals.totalPaise)}</Text>
      </View>
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button t={t} disabled={busy || !addressId || !slot}
        title={busy ? "Booking…" : !addressId ? "Add an address first" : !slot ? "Pick a time slot" : payMode === "online" ? `Pay ${formatRupees(totals.totalPaise)} and book` : "Confirm booking"}
        onPress={book} />
    </ScrollView>
  );
}

function AddAddress({ t, header, onSaved }: { t: Theme; header: React.ReactNode; onSaved: () => void }) {
  const [d, setD] = useState({ name: "", phone: "", line1: "", line2: "", landmark: "", pincode: "" });
  const [error, setError] = useState<string | null>(null);
  const f = (k: keyof typeof d, label: string, extra: Record<string, unknown> = {}) => (
    <Field t={t} label={label} value={d[k]} onChangeText={(v) => setD({ ...d, [k]: v })} {...extra} />
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {header}
      {f("name", "Contact name")}
      {f("phone", "Contact phone", { keyboardType: "phone-pad" })}
      {f("line1", "House / flat, street")}
      {f("line2", "Area / locality (e.g. Benachity)")}
      {f("landmark", "Landmark (optional)")}
      {f("pincode", "PIN code", { keyboardType: "number-pad", maxLength: 6 })}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button t={t} title="Save address" onPress={async () => {
        const p = addressInputSchema.safeParse({ ...d, line2: d.line2 || null, landmark: d.landmark || null, city: "Durgapur", state: "West Bengal" });
        if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the address");
        try { await api.addAddress(p.data); onSaved(); } catch (e) { setError((e as Error).message); }
      }} />
    </ScrollView>
  );
}

function BookingList({ t, header, card, onOpen }: { t: Theme; header: React.ReactNode; card: Card; onOpen: (id: string) => void }) {
  const [list, setList] = useState<HomeBooking[] | null>(null);
  useEffect(() => { api.home.bookings().then((r) => setList(r.bookings)).catch(() => setList([])); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {header}
      {list === null ? <Loading /> : list.length === 0 ? <Text style={{ color: t.muted }}>No bookings yet.</Text> : list.map((b) => (
        <Pressable key={b.id} onPress={() => onOpen(b.id)} style={card}>
          <Text style={{ color: t.text, fontWeight: "600" }}>{b.categoryName} · {formatRupees(b.totalPaise)}</Text>
          <Text style={{ color: t.primary, fontWeight: "600" }}>{b.statusLabel}</Text>
          <Text style={{ color: t.muted }}>{new Date(b.slotStart).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function BookingDetail({ t, header, card, id }: { t: Theme; header: React.ReactNode; card: Card; id: string }) {
  const [b, setB] = useState<HomeBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => api.home.booking(id).then((r) => setB(r.booking)).catch((e: Error) => setError(e.message));
    void load();
    const i = setInterval(load, 20_000);
    return () => clearInterval(i);
  }, [id]);
  if (!b) return <View style={{ padding: 16 }}>{header}{error ? <Text style={{ color: t.danger }}>{error}</Text> : <Loading />}</View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {header}
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "700" }}>{b.categoryName}</Text>
      <Text style={{ color: t.primary, fontWeight: "600" }}>{b.statusLabel}</Text>
      <Text style={{ color: t.muted }}>{b.code} · {new Date(b.slotStart).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</Text>
      {b.startCode && ["confirmed", "assigned", "on_the_way"].includes(b.status) && (
        <View style={[card, { alignItems: "center" }]}>
          <Text style={{ color: t.muted }}>Share this code when the professional arrives</Text>
          <Text style={{ color: t.text, fontSize: 32, fontWeight: "700", letterSpacing: 8 }}>{b.startCode}</Text>
        </View>
      )}
      {b.pro && <View style={card}><Text style={{ color: t.text, fontWeight: "600" }}>{b.pro.name}</Text>{b.pro.phone && <Text style={{ color: t.muted }}>{formatPhone(b.pro.phone)}</Text>}</View>}
      <View style={card}>
        {b.items.map((i) => <Text key={i.serviceId} style={{ color: t.text }}>{i.name} × {i.qty}</Text>)}
        <Text style={{ color: t.text, fontWeight: "700", marginTop: 6 }}>Total {formatRupees(b.totalPaise)} · {b.paid ? "Paid" : b.payMode === "after_service" ? "Pay after service" : "Not paid"}</Text>
      </View>
      {b.events.map((e, i) => <Text key={i} style={{ color: t.muted }}>• {e.note ?? b.statusLabel}</Text>)}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      {b.canCancel && (
        <Button t={t} ghost title="Cancel booking" onPress={() => Alert.alert("Cancel booking?", b.paid ? "You'll get a full refund." : "", [
          { text: "Keep", style: "cancel" },
          { text: "Cancel booking", style: "destructive", onPress: () => void api.home.cancel(b.id).then((r) => setB(r.booking)).catch((e: Error) => setError(e.message)) },
        ])} />
      )}
    </ScrollView>
  );
}
