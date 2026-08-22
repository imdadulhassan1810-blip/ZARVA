import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Listing } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";
import { ListingCard } from "../components/ListingCard";

export function Category() {
  const { slug = "" } = useParams();
  const category = CATEGORY_BY_SLUG[slug];

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"" | "price_asc" | "price_desc" | "rating_desc">("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const combinedQuery = category?.group === "booking" ? [from, to, query].filter(Boolean).join(" ") : query;
      const results = await api.searchListings({
        category: slug,
        query: combinedQuery || undefined,
        date: date || undefined,
        sort: sort || undefined,
      });
      setListings(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setFrom("");
    setTo("");
    setDate("");
    setQuery("");
    setSort("");
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!category) {
    return <p className="text-slate-500">Unknown category.</p>;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span>{category.icon}</span> {category.name}
        </h1>
        <p className="text-slate-500 text-sm">{category.description}</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-4"
      >
        {category.group === "booking" ? (
          <>
            {category.searchFields?.from && (
              <input
                placeholder={category.searchFields.from}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            )}
            {category.searchFields?.to && (
              <input
                placeholder={category.searchFields.to}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            )}
            {category.searchFields?.date && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            )}
          </>
        ) : (
          <input
            placeholder={`Search ${category.name.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-2"
          />
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Sort by</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating_desc">Rating</option>
        </select>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white rounded-md py-2 font-medium text-sm"
        >
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : listings.length === 0 ? (
        <p className="text-slate-500">No results found. Try clearing filters.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
