import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Listing } from "@oneapp/shared";
import { colors } from "../theme";

export function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {listing.imageUrl ? (
        <Image source={{ uri: listing.imageUrl }} style={styles.thumb} />
      ) : (
        <Text style={styles.emoji}>{listing.imageEmoji}</Text>
      )}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{listing.title}</Text>
              {listing.source ? (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : null}
            </View>
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
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.chip },
  body: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  titleBlock: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveBadge: { backgroundColor: "#d1fae5", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  liveBadgeText: { fontSize: 9, fontWeight: "800", color: "#047857" },
  title: { fontWeight: "700", fontSize: 14, color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  priceBlock: { alignItems: "flex-end" },
  price: { fontWeight: "700", color: colors.brand, fontSize: 14 },
  priceUnit: { fontSize: 10, color: colors.muted },
  metaRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  metaText: { fontSize: 11, color: colors.muted },
});
