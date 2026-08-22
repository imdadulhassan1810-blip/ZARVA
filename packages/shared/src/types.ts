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
  price: number;
  /** e.g. "per night", "per seat", "per kg", "flat fare" */
  priceUnit: string;
  rating?: number | null;
  location?: string | null;
  tags: string[];
  /** Free-form category-specific details (duration, stops, room type, brand, size options, etc.) */
  meta: Record<string, unknown>;
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
export type OrderStatus = "confirmed" | "completed" | "cancelled";

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
