import { CATEGORIES } from "@oneapp/shared";
import { CategoryCard } from "../components/CategoryCard";

const GROUPS: { key: "booking" | "shop" | "bills"; title: string }[] = [
  { key: "booking", title: "Travel & bookings" },
  { key: "shop", title: "Shop" },
  { key: "bills", title: "Pay bills" },
];

export function Home() {
  return (
    <div className="space-y-10">
      <section className="bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-2xl p-8 sm:p-12">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Everything you need. One app.
        </h1>
        <p className="mt-3 text-brand-100 max-w-2xl">
          Cabs, hotels, flights, trains, buses, groceries, stationary, electronics, clothing,
          gas refills and bill payments — book or buy it all without leaving OneApp.
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.key}>
          <h2 className="text-lg font-bold mb-3">{group.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {CATEGORIES.filter((c) => c.group === group.key).map((c) => (
              <CategoryCard key={c.slug} category={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
