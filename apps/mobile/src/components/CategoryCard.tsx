import { Pressable, StyleSheet, Text } from "react-native";
import type { CategoryDef } from "@oneapp/shared";
import { colors } from "../theme";

export function CategoryCard({ category, onPress }: { category: CategoryDef; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.icon}>{category.icon}</Text>
      <Text style={styles.name}>{category.name}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {category.description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  icon: { fontSize: 28 },
  name: { fontWeight: "700", fontSize: 13, color: colors.text },
  description: { fontSize: 11, color: colors.muted, textAlign: "center" },
});
