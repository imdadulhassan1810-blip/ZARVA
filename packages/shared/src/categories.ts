/**
 * The single source of truth for every service category OneApp aggregates.
 * Both the web app and the mobile app render their home screens from this list,
 * and the backend validates listings/orders against these slugs.
 */

export type CategoryGroup = "booking" | "shop" | "bills";

export interface CategoryDef {
  slug: string;
  name: string;
  /** Emoji icon so both web and native render without bundling icon assets. */
  icon: string;
  group: CategoryGroup;
  description: string;
  /** Labels for the search form fields this category needs (booking group only). */
  searchFields?: {
    from?: string;
    to?: string;
    date?: string;
    extra?: string;
  };
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "cab",
    name: "Cabs",
    icon: "🚕",
    group: "booking",
    description: "Book a ride across town, on demand.",
    searchFields: { from: "Pickup location", to: "Drop location", extra: "Vehicle type" },
  },
  {
    slug: "hotel",
    name: "Hotels",
    icon: "🏨",
    group: "booking",
    description: "Find and book hotels & stays.",
    searchFields: { to: "City / area", date: "Check-in", extra: "Guests & rooms" },
  },
  {
    slug: "flight",
    name: "Flights",
    icon: "✈️",
    group: "booking",
    description: "Search and book domestic & international flights.",
    searchFields: { from: "From", to: "To", date: "Departure date", extra: "Travellers" },
  },
  {
    slug: "train",
    name: "Trains",
    icon: "🚆",
    group: "booking",
    description: "Book train tickets between stations.",
    searchFields: { from: "From station", to: "To station", date: "Travel date", extra: "Class" },
  },
  {
    slug: "bus",
    name: "Buses",
    icon: "🚌",
    group: "booking",
    description: "Book intercity bus tickets.",
    searchFields: { from: "From city", to: "To city", date: "Travel date", extra: "Seats" },
  },
  {
    slug: "gas",
    name: "Gas Booking",
    icon: "🛢️",
    group: "booking",
    description: "Book an LPG cylinder refill for home delivery.",
    searchFields: { to: "Delivery address", extra: "Cylinder type" },
  },
  {
    slug: "movies",
    name: "Movies & Events",
    icon: "🎬",
    group: "booking",
    description: "Book tickets for movies, concerts & events.",
    searchFields: { to: "City", date: "Date", extra: "Language / genre" },
  },
  {
    slug: "homeservices",
    name: "Home Services",
    icon: "🧰",
    group: "booking",
    description: "Book a plumber, electrician, cleaner, salon-at-home & more.",
    searchFields: { to: "Your area", date: "Preferred date", extra: "Service type" },
  },
  {
    slug: "grocery",
    name: "Grocery",
    icon: "🛒",
    group: "shop",
    description: "Fresh produce, staples & daily essentials.",
  },
  {
    slug: "stationary",
    name: "Stationary",
    icon: "📚",
    group: "shop",
    description: "Office & school supplies.",
  },
  {
    slug: "electronics",
    name: "Electronics",
    icon: "💻",
    group: "shop",
    description: "Gadgets, appliances & accessories.",
  },
  {
    slug: "clothing",
    name: "Clothing",
    icon: "👕",
    group: "shop",
    description: "Fashion for everyone.",
  },
  {
    slug: "food",
    name: "Food Delivery",
    icon: "🍔",
    group: "shop",
    description: "Order from your favourite restaurants.",
  },
  {
    slug: "pharmacy",
    name: "Pharmacy",
    icon: "💊",
    group: "shop",
    description: "Medicines & healthcare, delivered.",
  },
  {
    slug: "bills",
    name: "Bill Payments",
    icon: "🧾",
    group: "bills",
    description: "Pay electricity, water, mobile, DTH & broadband bills.",
  },
];

export const CATEGORY_BY_SLUG: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
);

export const BOOKING_CATEGORY_SLUGS = CATEGORIES.filter((c) => c.group === "booking").map(
  (c) => c.slug,
);
export const SHOP_CATEGORY_SLUGS = CATEGORIES.filter((c) => c.group === "shop").map((c) => c.slug);

/** Categories where an order gets a simulated live-tracking journey (a moving driver/partner, ETA, status). */
export const TRACKABLE_CATEGORY_SLUGS = ["cab", "food", "homeservices"];

/** Categories whose listing price is computed dynamically (distance/demand/date) rather than a fixed seed price. */
export const DYNAMIC_PRICING_CATEGORY_SLUGS = ["cab", "hotel", "flight"];

export const BILLER_TYPES = [
  { slug: "electricity", name: "Electricity", icon: "💡" },
  { slug: "water", name: "Water", icon: "🚰" },
  { slug: "mobile", name: "Mobile Recharge", icon: "📱" },
  { slug: "dth", name: "DTH", icon: "📺" },
  { slug: "broadband", name: "Broadband", icon: "🌐" },
  { slug: "credit-card", name: "Credit Card", icon: "💳" },
] as const;

export type BillerTypeSlug = (typeof BILLER_TYPES)[number]["slug"];
