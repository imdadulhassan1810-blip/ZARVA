import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { FareQuote, GeoPoint, Listing, Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG, TRACKABLE_CATEGORY_SLUGS } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { colors } from "../theme";
import { PaymentActions } from "../components/PaymentActions";
import { CabMapPicker } from "../components/CabMapPicker";

type Props = NativeStackScreenProps<RootStackParamList, "ListingDetail">;

export function ListingDetailScreen({ route, navigation }: Props) {
  const { id, date } = route.params;
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [listing, setListing] = useState<Listing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Order | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    api
      .getListing(id, date)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [id, date]);

  const isCab = listing?.categorySlug === "cab";

  useEffect(() => {
    if (!isCab || !listing || !pickup || !drop) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    api
      .quoteCabFare({ listingId: listing.id, pickup, drop })
      .then((q) => !cancelled && setQuote(q))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't price this ride"))
      .finally(() => !cancelled && setQuoting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCab, listing?.id, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng]);

  if (error && !listing) return <Text style={styles.error}>{error}</Text>;
  if (!listing) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;

  const category = CATEGORY_BY_SLUG[listing.categorySlug];
  const isBooking = category?.group === "booking";
  const needsPickupDrop = isCab && (!pickup || !drop);
  const isTrackable = TRACKABLE_CATEGORY_SLUGS.includes(listing.categorySlug);
  const displayPrice = isCab ? (quote?.total ?? listing.price) : listing.price;

  async function handleAddToCart() {
    if (!user) {
      navigation.navigate("Login");
      return;
    }
    if (!listing) return;
    setSubmitting(true);
    setError(null);
    try {
      await addToCart(listing.id, quantity);
      navigation.navigate("Cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBookingSuccess(order: Order) {
    setConfirmed(order);
  }

  if (confirmed) {
    return (
      <View style={styles.confirmScreen}>
        <Text style={styles.confirmEmoji}>✅</Text>
        <Text style={styles.confirmTitle}>Booking confirmed!</Text>
        <Text style={styles.confirmSubtitle}>
          {listing.title} is booked. Order ref {confirmed.id.slice(0, 8)}.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {isTrackable && (
            <Pressable
              style={[styles.button, { backgroundColor: colors.success }]}
              onPress={() => navigation.navigate("Tracking", { orderId: confirmed.id })}
            >
              <Text style={styles.buttonText}>Track live</Text>
            </Pressable>
          )}
          <Pressable style={styles.button} onPress={() => navigation.navigate("Orders")}>
            <Text style={styles.buttonText}>View my orders</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.thumb} />
        ) : (
          <Text style={styles.emoji}>{listing.imageEmoji}</Text>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{listing.title}</Text>
          {listing.subtitle ? <Text style={styles.subtitle}>{listing.subtitle}</Text> : null}
          {Boolean(listing.meta.dynamicPricing) && <Text style={styles.liveBadge}>🔥 Live pricing</Text>}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.price}>{isCab && !quote ? "—" : `₹${displayPrice.toLocaleString("en-IN")}`}</Text>
          <Text style={styles.priceUnit}>{isCab ? "estimated fare" : listing.priceUnit}</Text>
        </View>
      </View>

      {Object.keys(listing.meta).length > 0 && (
        <View style={styles.metaBox}>
          {Object.entries(listing.meta)
            .filter(([k]) => {
              const hidden = ["dynamicPricing", "basePrice", "priceMultiplier"];
              const cabKeys = ["perKmRate", "perMinRate", "avgSpeedKmh"];
              return !hidden.includes(k) && !(isCab && cabKeys.includes(k));
            })
            .map(([k, v]) => (
              <View key={k} style={styles.metaRow}>
                <Text style={styles.metaKey}>{k}</Text>
                <Text style={styles.metaValue}>{Array.isArray(v) ? v.join(", ") : String(v)}</Text>
              </View>
            ))}
        </View>
      )}

      {isCab && (
        <View>
          <Text style={styles.qtyLabel}>Pickup & drop location</Text>
          <View style={{ height: 8 }} />
          <CabMapPicker
            pickup={pickup}
            drop={drop}
            onChange={(next) => {
              setPickup(next.pickup);
              setDrop(next.drop);
            }}
          />
          {quoting && <Text style={styles.muted}>Calculating fare…</Text>}
          {quote && (
            <View style={styles.quoteBox}>
              <Text style={styles.muted}>
                {quote.distanceKm} km · ~{quote.durationMin} min
              </Text>
              <Text style={styles.muted}>
                Base ₹{quote.baseFare} + ₹{quote.distanceFare} dist. + ₹{quote.timeFare} time
              </Text>
              <View style={styles.quoteTotalRow}>
                <Text style={[styles.surgeText, quote.surgeMultiplier > 1 && { color: "#b45309" }]}>
                  {quote.surgeMultiplier > 1 ? `⚡ ${quote.surgeMultiplier}× surge` : "No surge right now"}
                </Text>
                <Text style={styles.quoteTotal}>₹{quote.total}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {!isCab && (
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>{isBooking ? "Quantity / travellers" : "Quantity"}</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepperBtn} onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Text style={styles.stepperBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <Pressable style={styles.stepperBtn} onPress={() => setQuantity((q) => Math.min(20, q + 1))}>
              <Text style={styles.stepperBtnText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.totalText}>
            Total: <Text style={styles.totalValue}>₹{(listing.price * quantity).toLocaleString("en-IN")}</Text>
          </Text>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isBooking ? (
        needsPickupDrop ? (
          <View style={[styles.button, styles.buttonDisabled]}>
            <Text style={styles.buttonDisabledText}>Set pickup & drop on the map to continue</Text>
          </View>
        ) : isCab && (quoting || !quote) ? (
          <View style={[styles.button, styles.buttonDisabled]}>
            <Text style={styles.buttonDisabledText}>{quoting ? "Calculating fare…" : "Waiting for fare…"}</Text>
          </View>
        ) : !user ? (
          <Pressable style={styles.button} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.buttonText}>Log in to book</Text>
          </Pressable>
        ) : (
          <PaymentActions
            label={isCab && quote ? `Book now — ₹${quote.total}` : "Book now"}
            onMockPay={() =>
              api.createBooking({ listingId: listing.id, quantity, details: isCab ? { pickup, drop } : undefined })
            }
            onRazorpayInit={() =>
              api.createBookingWithRazorpay({
                listingId: listing.id,
                quantity,
                details: isCab ? { pickup, drop } : undefined,
              })
            }
            onSuccess={handleBookingSuccess}
          />
        )
      ) : (
        <Pressable style={styles.button} onPress={handleAddToCart} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add to cart</Text>}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  emoji: { fontSize: 44 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.chip },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  liveBadge: { fontSize: 10, fontWeight: "700", color: "#b45309", marginTop: 4 },
  price: { fontSize: 20, fontWeight: "800", color: colors.brand },
  priceUnit: { fontSize: 11, color: colors.muted },
  metaBox: { backgroundColor: colors.card, borderRadius: 10, padding: 12, gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaKey: { color: colors.muted, fontSize: 12, textTransform: "capitalize" },
  metaValue: { fontWeight: "600", fontSize: 12, color: colors.text },
  muted: { fontSize: 11, color: colors.muted, marginTop: 6 },
  quoteBox: { backgroundColor: colors.card, borderRadius: 10, padding: 10, marginTop: 8, gap: 2 },
  quoteTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  surgeText: { fontSize: 12, fontWeight: "600", color: colors.text },
  quoteTotal: { fontSize: 14, fontWeight: "800", color: colors.text },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { fontWeight: "600", fontSize: 13, color: colors.text },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  stepperBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  stepperBtnText: { fontSize: 18, color: colors.text },
  stepperValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  totalText: { fontSize: 13, color: colors.muted, textAlign: "right" },
  totalValue: { fontWeight: "800", color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
  button: { flex: 1, backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.chip },
  buttonDisabledText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  confirmScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: colors.bg },
  confirmEmoji: { fontSize: 44 },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  confirmSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 12 },
});
