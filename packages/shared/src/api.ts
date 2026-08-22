import type {
  AuthResponse,
  Bill,
  CartItem,
  GeoPoint,
  Listing,
  ListingSearchQuery,
  Order,
  RazorpayCheckoutInfo,
  RazorpayConfig,
  RazorpayVerifyInput,
  User,
} from "./types";

export type TokenStore = {
  get: () => string | null | Promise<string | null>;
  set: (token: string | null) => void | Promise<void>;
};

/**
 * Thin fetch-based API client shared between the web app and the Expo mobile app.
 * Both platforms provide their own TokenStore (localStorage vs SecureStore/AsyncStorage)
 * and their own base URL, everything else is identical.
 */
export class ApiClient {
  constructor(
    private baseUrl: string,
    private tokenStore: TokenStore,
  ) {}

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const { method = "GET", body, auth = true } = options;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (auth) {
      const token = await this.tokenStore.get();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const data = (await res.json()) as { message?: string; error?: string };
        message = data.message ?? data.error ?? message;
      } catch {
        // ignore non-JSON error bodies
      }
      throw new Error(message);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- Auth ---
  async register(input: { name: string; email: string; password: string; phone?: string }) {
    const data = await this.request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    });
    await this.tokenStore.set(data.token);
    return data;
  }

  async login(input: { email: string; password: string }) {
    const data = await this.request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
    await this.tokenStore.set(data.token);
    return data;
  }

  async logout() {
    await this.tokenStore.set(null);
  }

  async me() {
    return this.request<User>("/api/auth/me");
  }

  // --- Categories & listings ---
  async listCategories() {
    return this.request<{ slug: string; count: number }[]>("/api/categories", { auth: false });
  }

  async searchListings(query: ListingSearchQuery) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== "") params.set(k, String(v));
    });
    return this.request<Listing[]>(`/api/listings?${params.toString()}`, { auth: false });
  }

  async getListing(id: string) {
    return this.request<Listing>(`/api/listings/${id}`, { auth: false });
  }

  /** Live product search against a real external catalog (currently: grocery via Open Food Facts). No local seed data involved. */
  async searchLiveGrocery(query: string) {
    return this.request<Listing[]>(`/api/listings/live/grocery?query=${encodeURIComponent(query)}`, {
      auth: false,
    });
  }

  // --- Cart (shop categories) ---
  async getCart() {
    return this.request<CartItem[]>("/api/cart");
  }

  async addToCart(listingId: string, quantity = 1) {
    return this.request<CartItem[]>("/api/cart", { method: "POST", body: { listingId, quantity } });
  }

  async updateCartItem(itemId: string, quantity: number) {
    return this.request<CartItem[]>(`/api/cart/${itemId}`, { method: "PATCH", body: { quantity } });
  }

  async removeCartItem(itemId: string) {
    return this.request<CartItem[]>(`/api/cart/${itemId}`, { method: "DELETE" });
  }

  async checkoutCart(details?: Record<string, unknown>) {
    return this.request<Order>("/api/cart/checkout", { method: "POST", body: { details } });
  }

  /** Same as checkoutCart, but pays via Razorpay instead of instant mock success. Returns a pending order plus what's needed to open Razorpay Checkout; call verifyRazorpayPayment once it completes. */
  async checkoutCartWithRazorpay(details?: Record<string, unknown>) {
    return this.request<RazorpayCheckoutInfo>("/api/cart/checkout/razorpay", {
      method: "POST",
      body: { details },
    });
  }

  // --- Direct booking (travel/gas categories) ---
  async createBooking(input: {
    listingId: string;
    quantity?: number;
    details?: Record<string, unknown>;
  }) {
    return this.request<Order>("/api/bookings", { method: "POST", body: input });
  }

  async createBookingWithRazorpay(input: {
    listingId: string;
    quantity?: number;
    details?: Record<string, unknown>;
  }) {
    return this.request<RazorpayCheckoutInfo>("/api/bookings/razorpay", { method: "POST", body: input });
  }

  // --- Bills ---
  async lookupBill(billerType: string, consumerNumber: string) {
    return this.request<Bill>(
      `/api/bills/lookup?billerType=${encodeURIComponent(billerType)}&consumerNumber=${encodeURIComponent(consumerNumber)}`,
    );
  }

  async payBill(input: { billerType: string; billerName: string; consumerNumber: string; amount: number }) {
    return this.request<Order>("/api/bills/pay", { method: "POST", body: input });
  }

  async payBillWithRazorpay(input: {
    billerType: string;
    billerName: string;
    consumerNumber: string;
    amount: number;
  }) {
    return this.request<RazorpayCheckoutInfo>("/api/bills/pay/razorpay", { method: "POST", body: input });
  }

  // --- Razorpay ---
  async getRazorpayConfig() {
    return this.request<RazorpayConfig>("/api/payments/razorpay/config", { auth: false });
  }

  async verifyRazorpayPayment(input: RazorpayVerifyInput) {
    return this.request<Order>("/api/payments/razorpay/verify", { method: "POST", body: input });
  }

  // --- Maps (cab pickup/drop) ---
  async reverseGeocode(lat: number, lng: number) {
    return this.request<GeoPoint>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, { auth: false });
  }

  // --- Push notifications ---
  async registerPushToken(token: string) {
    return this.request<{ ok: true }>("/api/notifications/register-token", {
      method: "POST",
      body: { token },
    });
  }

  // --- Orders ---
  async listOrders() {
    return this.request<Order[]>("/api/orders");
  }
}
