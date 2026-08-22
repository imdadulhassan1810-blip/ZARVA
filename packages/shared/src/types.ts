export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * A single item within a category:
 *  - for "booking" categories (cab/hotel/flight/train/bus/gas) this is a bookable
 *    option returned from a search (e.g. one flight, one hotel room type).
 *  - for "shop" categories (grocery/stationary/electronics/clothing) this is a product.
 */
export interface Listing {
  id: string;
  categorySlug: string;
  title: string;
  subtitle?: string | null;
  imageEmoji: string;
  /** A real product photo URL, when the listing comes from a live provider (e.g. grocery). Falls back to imageEmoji when absent. */
  imageUrl?: string | null;
  price: number;
  /** e.g. "per night", "per seat", "per kg", "flat fare" */
  priceUnit: string;
  rating?: number | null;
  location?: string | null;
  tags: string[];
  /** Free-form category-specific details (duration, stops, room type, brand, size options, etc.) */
  meta: Record<string, unknown>;
  /** Set when this listing was fetched live from an external provider rather than our own seeded catalog. */
  source?: string;
}

export interface ListingSearchQuery {
  category: string;
  from?: string;
  to?: string;
  date?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "rating_desc";
}

export interface CartItem {
  id: string;
  listingId: string;
  listing: Listing;
  quantity: number;
}

export interface Bill {
  id: string;
  billerType: string;
  billerName: string;
  consumerNumber: string;
  amountDue: number;
  dueDate: string;
}

export type OrderType = "booking" | "purchase" | "bill_payment";
export type OrderStatus = "pending_payment" | "confirmed" | "completed" | "cancelled";
export type PaymentMethod = "mock" | "razorpay";

export interface OrderItem {
  listingTitle: string;
  categorySlug: string;
  quantity: number;
  unitPrice: number;
  meta?: Record<string, unknown>;
}

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  categorySlug: string;
  total: number;
  items: OrderItem[];
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface RazorpayConfig {
  enabled: boolean;
  keyId?: string;
}

export interface RazorpayCheckoutInfo {
  order: Order;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface RazorpayVerifyInput {
  orderId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** A priced cab fare, computed server-side from real pickup/drop coordinates + live surge. Never trust a client-supplied total. */
export interface FareQuote {
  distanceKm: number;
  durationMin: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  surgeMultiplier: number;
  total: number;
  currency: string;
  /** Human-readable reason for the current surge level, e.g. "Evening peak demand". */
  surgeReason: string;
}

export type TrackingStatus =
  | "assigned"
  | "heading_to_pickup"
  | "arrived_pickup"
  | "in_progress"
  | "completed";

export interface TrackingDriver {
  name: string;
  phone: string;
  vehicleNumber: string;
  rating: number;
  vehicleLabel: string;
}

/** Live (simulated) position of a driver/delivery partner for an order, computed from elapsed real time. */
export interface TrackingState {
  orderId: string;
  status: TrackingStatus;
  /** 0..1 across the whole journey. */
  progress: number;
  position: GeoPoint;
  etaMinutes: number;
  route: GeoPoint[];
  driver: TrackingDriver;
  startedAt: string;
}
