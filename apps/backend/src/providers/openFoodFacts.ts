import type { Listing } from "@oneapp/shared";

interface OffProduct {
  code: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_url?: string;
  categories_tags?: string[];
  nutriscore_grade?: string;
}

interface OffSearchResponse {
  products: OffProduct[];
}

/**
 * Real, free, no-API-key-required grocery product data from Open Food Facts
 * (https://world.openfoodfacts.org), a crowdsourced open database of ~3M packaged
 * food products. Prices aren't part of that dataset (it's not a store), so we
 * synthesize a plausible one deterministically from the barcode — everything else
 * (name, brand, image, categories) is real product data.
 */
export async function searchOpenFoodFacts(query: string, limit = 12): Promise<Listing[]> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set(
    "fields",
    "code,product_name,brands,quantity,image_front_small_url,image_url,categories_tags,nutriscore_grade",
  );

  const res = await fetch(url, {
    headers: {
      // Open Food Facts asks all API consumers to identify themselves.
      "User-Agent": "OneApp-DailyChoresSystem/0.1 (demo grocery integration)",
    },
  });
  if (!res.ok) throw new Error(`Open Food Facts request failed: ${res.status}`);

  const data = (await res.json()) as OffSearchResponse;

  return data.products
    .filter((p) => p.product_name)
    .slice(0, limit)
    .map((p) => productToListing(p));
}

/** Fetch a single product by barcode — used to persist a live listing the first time it's actually bought. */
export async function fetchOpenFoodFactsProduct(barcode: string): Promise<Listing | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
    headers: { "User-Agent": "OneApp-DailyChoresSystem/0.1 (demo grocery integration)" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { status: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return null;

  return productToListing({ ...data.product, code: data.product.code ?? barcode });
}

function productToListing(p: OffProduct): Listing {
  const price = syntheticPrice(p.code);
  const category = p.categories_tags?.[p.categories_tags.length - 1]?.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");

  return {
    id: `off:${p.code}`,
    categorySlug: "grocery",
    title: p.product_name ?? "Unknown product",
    subtitle: [p.brands, p.quantity].filter(Boolean).join(" · ") || null,
    imageEmoji: "🛒",
    imageUrl: p.image_front_small_url ?? p.image_url ?? null,
    price,
    priceUnit: "per pack",
    rating: p.nutriscore_grade ? nutriscoreToRating(p.nutriscore_grade) : null,
    location: "Live from Open Food Facts",
    tags: [category, "live"].filter((t): t is string => Boolean(t)),
    meta: { barcode: p.code, brand: p.brands ?? null },
    source: "openfoodfacts",
  };
}

// Deterministic so the same product always shows the same price within a session,
// without pretending it came from a real price list.
function syntheticPrice(barcode: string): number {
  let hash = 0;
  for (const ch of barcode) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.round((49 + (hash % 451)) / 5) * 5; // ₹49–₹500, rounded to nearest ₹5
}

function nutriscoreToRating(grade: string): number {
  const map: Record<string, number> = { a: 4.8, b: 4.3, c: 3.8, d: 3.2, e: 2.6 };
  return map[grade.toLowerCase()] ?? 3.5;
}
