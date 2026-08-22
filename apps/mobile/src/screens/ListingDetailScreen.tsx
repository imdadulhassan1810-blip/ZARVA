import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Listing } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { colors } from "../theme";

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

  useEffect(() => {
    api
      .getListing(id)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"));
  }, [id]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!listing) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;

  const category = CATEGORY_BY_SLUG[listing.categorySlug];
  const isBooking = category?.group === "booking";

  async function handlePrimaryAction() {
    if (!user) {
      navigation.navigate("Login");
      return;
    }
    if (!listing) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isBooking) {
        const order = await api.createBooking({ listingId: listing.id, quantity });
        setConfirmed(order.id);
      } else {
        await addToCart(listing.id, quantity);
        navigation.navigate("Cart");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
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
        <Text style={styles.emoji}>{listing.imageEmoji}</Text>
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

      <Pressable style={styles.button} onPress={handlePrimaryAction} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isBooking ? "Book now" : "Add to cart"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  emoji: { fontSize: 44 },
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
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  confirmScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: colors.bg },
  confirmEmoji: { fontSize: 44 },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  confirmSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 12 },
});
