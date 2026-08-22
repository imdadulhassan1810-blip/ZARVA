import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Listing } from "@oneapp/shared";
import { colors } from "../theme";

export function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.emoji}>{listing.imageEmoji}</Text>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{listing.title}</Text>
            {listing.subtitle ? <Text style={styles.subtitle}>{listing.subtitle}</Text> : null}
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>₹{listing.price.toLocaleString("en-IN")}</Text>
            <Text style={styles.priceUnit}>{listing.priceUnit}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {listing.location ? <Text style={styles.metaText}>📍 {listing.location}</Text> : null}
          {listing.rating != null ? <Text style={styles.metaText}>⭐ {listing.rating.toFixed(1)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  emoji: { fontSize: 32 },
  body: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  titleBlock: { flex: 1 },
  title: { fontWeight: "700", fontSize: 14, color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  priceBlock: { alignItems: "flex-end" },
  price: { fontWeight: "700", color: colors.brand, fontSize: 14 },
  priceUnit: { fontSize: 10, color: colors.muted },
  metaRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  metaText: { fontSize: 11, color: colors.muted },
});
