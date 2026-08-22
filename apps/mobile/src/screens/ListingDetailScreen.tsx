import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GeoPoint, Listing, Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { colors } from "../theme";
import { PaymentActions } from "../components/PaymentActions";
import { CabMapPicker } from "../components/CabMapPicker";

type Props = NativeStackScreenProps<RootStackParamList, "ListingDetail">;

export function ListingDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [listing, setListing] = useState<Listing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);

  useEffect(() => {
    api
      .getListing(id)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [id]);

  if (error && !listing) return <Text style={styles.error}>{error}</Text>;
  if (!listing) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;

  const category = CATEGORY_BY_SLUG[listing.categorySlug];
  const isBooking = category?.group === "booking";
  const isCab = listing.categorySlug === "cab";
  const needsPickupDrop = isCab && (!pickup || !drop);

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
    setConfirmed(order.id);
  }

  if (confirmed) {
    return (
      <View style={styles.confirmScreen}>
        <Text style={styles.confirmEmoji}>✅</Text>
        <Text style={styles.confirmTitle}>Booking confirmed!</Text>
        <Text style={styles.confirmSubtitle}>
          {listing.title} is booked. Order ref {confirmed.slice(0, 8)}.
        </Text>
        <Pressable style={styles.button} onPress={() => navigation.navigate("Orders")}>
          <Text style={styles.buttonText}>View my orders</Text>
        </Pressable>
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
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.price}>₹{listing.price.toLocaleString("en-IN")}</Text>
          <Text style={styles.priceUnit}>{listing.priceUnit}</Text>
        </View>
      </View>

      {Object.keys(listing.meta).length > 0 && (
        <View style={styles.metaBox}>
          {Object.entries(listing.meta).map(([k, v]) => (
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
        </View>
      )}

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
      </View>
      <Text style={styles.totalText}>
        Total: <Text style={styles.totalValue}>₹{(listing.price * quantity).toLocaleString("en-IN")}</Text>
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isBooking ? (
        needsPickupDrop ? (
          <View style={[styles.button, styles.buttonDisabled]}>
            <Text style={styles.buttonDisabledText}>Set pickup & drop on the map to continue</Text>
          </View>
        ) : !user ? (
          <Pressable style={styles.button} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.buttonText}>Log in to book</Text>
          </Pressable>
        ) : (
          <PaymentActions
            label="Book now"
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
  price: { fontSize: 20, fontWeight: "800", color: colors.brand },
  priceUnit: { fontSize: 11, color: colors.muted },
  metaBox: { backgroundColor: colors.card, borderRadius: 10, padding: 12, gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaKey: { color: colors.muted, fontSize: 12, textTransform: "capitalize" },
  metaValue: { fontWeight: "600", fontSize: 12, color: colors.text },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { fontWeight: "600", fontSize: 13, color: colors.text },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  stepperBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  stepperBtnText: { fontSize: 18, color: colors.text },
  stepperValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  totalText: { fontSize: 13, color: colors.muted, textAlign: "right" },
  totalValue: { fontWeight: "800", color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
  button: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.chip },
  buttonDisabledText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  confirmScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: colors.bg },
  confirmEmoji: { fontSize: 44 },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  confirmSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 12 },
});
