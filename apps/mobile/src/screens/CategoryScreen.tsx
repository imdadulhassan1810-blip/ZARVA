import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Listing } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../lib/api";
import { ListingCard } from "../components/ListingCard";
import { colors } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Category">;

export function CategoryScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const category = CATEGORY_BY_SLUG[slug];

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: category ? `${category.icon} ${category.name}` : "Category" });
  }, [category, navigation]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const combinedQuery = category?.group === "booking" ? [from, to, query].filter(Boolean).join(" ") : query;
      const results = await api.searchListings({ category: slug, query: combinedQuery || undefined });
      setListings(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!category) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
        {category.group === "booking" ? (
          <>
            {category.searchFields?.from && (
              <TextInput
                style={styles.input}
                placeholder={category.searchFields.from}
                value={from}
                onChangeText={setFrom}
              />
            )}
            {category.searchFields?.to && (
              <TextInput
                style={styles.input}
                placeholder={category.searchFields.to}
                value={to}
                onChangeText={setTo}
              />
            )}
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder={`Search ${category.name.toLowerCase()}…`}
            value={query}
            onChangeText={setQuery}
          />
        )}
        <Pressable style={styles.searchButton} onPress={runSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.brand} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No results found.</Text>}
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={() => navigation.navigate("ListingDetail", { id: item.id })} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 8,
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  list: { padding: 16, gap: 10 },
  loading: { marginTop: 40 },
  error: { color: colors.danger, textAlign: "center", marginTop: 40 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
