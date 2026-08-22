export type UserRole = "user" | "admin";
/** How this account authenticates. "google" accounts have no password — see /api/auth/google. */
export type AuthProvider = "password" | "google";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  authProvider: AuthProvider;
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
/** "mock" is the demo fallback used only when Razorpay isn't configured and the category isn't COD-eligible. */
export type PaymentMethod = "mock" | "cod" | "card" | "netbanking" | "razorpay";
/** The three online flavours actually route through the same Razorpay Checkout widget, restricted to the chosen method — see openRazorpayCheckout / RazorpayCheckoutModal. */
export type OnlinePaymentMethod = "card" | "netbanking" | "razorpay";

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
  paymentMethod: PaymentMethod;
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

export interface GoogleAuthConfig {
  enabled: boolean;
  /** "Web application" OAuth client id — used by the web app, and as the Expo Go / web-target client id on mobile. */
  clientId?: string;
  /** Native OAuth client ids, required for Google sign-in in a real iOS/Android build (not Expo Go) — see the README. */
  iosClientId?: string;
  androidClientId?: string;
}

export interface RazorpayCheckoutInfo {
  order: Order;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  /** Which Razorpay Checkout method tab to restrict the widget to. */
  preferredMethod: OnlinePaymentMethod;
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

// --- Admin (only ever returned to a logged-in admin — see /api/admin/*) ---

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  authProvider: AuthProvider;
  isActive: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

/** Same shape as Order, plus who placed it — admins need to see across every user. */
export interface AdminOrder extends Order {
  userId: string;
  userName: string;
  userEmail: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalOrders: number;
  totalRevenue: number;
  ordersByCategory: Record<string, number>;
  ordersByStatus: Record<string, number>;
}
