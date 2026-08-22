import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CATEGORIES } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { CategoryCard } from "../components/CategoryCard";
import { colors } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const GROUPS: { key: "booking" | "shop" | "bills"; title: string }[] = [
  { key: "booking", title: "Travel & bookings" },
  { key: "shop", title: "Shop" },
  { key: "bills", title: "Pay bills" },
];

export function HomeScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Everything you need. One app.</Text>
        <Text style={styles.heroSubtitle}>
          Cabs, hotels, flights, trains, buses, groceries, stationary, electronics, clothing, gas
          refills and bill payments.
        </Text>
      </View>

      {GROUPS.map((group) => (
        <View key={group.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{group.title}</Text>
          <View style={styles.grid}>
            {CATEGORIES.filter((c) => c.group === group.key).map((c) => (
              <CategoryCard
                key={c.slug}
                category={c}
                onPress={() =>
                  c.group === "bills" ? navigation.navigate("Bills") : navigation.navigate("Category", { slug: c.slug })
                }
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroSubtitle: { color: colors.brandLight, fontSize: 13, lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
