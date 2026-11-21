import type { Address, AuthProviders, AuthTokens, LoginResult, PublicUser } from "./api-types";
import type { ModuleStatus } from "./modules";
import type { AddressInput, ProfileUpdate } from "./schemas";
import type {
  HomeAdminCategory, HomeBooking, HomeBookingStatus, HomeCategory, HomeCity, HomeCreateBooking, HomeEarnings, HomePayout, HomePro,
  HomeProApply, HomeProBalance, HomeProDocKind, HomeProPayoutInput, HomeProUpdate, HomeService, HomeSlotDay,
} from "./home";

export interface HomePaymentStart { id: string; status: string; clientPayload: Record<string, unknown> }
export interface PaymentConfirmation { providerOrderId: string; providerPaymentId: string; signature: string }

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): void;
}

const H = "/v1/m/home";

/** Tiny typed client shared by web and mobile. Refreshes the access token once on 401. */
export function createApiClient(baseUrl: string, store: TokenStore, fetchImpl: typeof fetch = fetch) {
  async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const tokens = store.get();
    if (auth && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    // Files (KYC documents) come back as bytes, everything else as JSON.
    if (res.ok && !(res.headers.get("content-type") ?? "").includes("json")) return (await res.blob()) as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    if (!res.ok) throw new ApiRequestError(res.status, json.error?.code ?? "unknown", json.error?.message ?? res.statusText);
    return json as T;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await raw<T>(method, path, body);
    } catch (e) {
      const tokens = store.get();
      if (e instanceof ApiRequestError && e.status === 401 && tokens) {
        try {
          const fresh = await raw<AuthTokens>("POST", "/v1/auth/refresh", { refreshToken: tokens.refreshToken }, false);
          store.set(fresh);
        } catch {
          store.set(null);
          throw e;
        }
        return raw<T>(method, path, body);
      }
      throw e;
    }
  }

  async function login(path: string, body: unknown): Promise<LoginResult> {
    const r = await raw<LoginResult>("POST", path, body, false);
    store.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
    return r;
  }

  return {
    requestOtp: (phone: string) => raw<{ sent: true; retryAfter: number }>("POST", "/v1/auth/otp/request", { phone }, false),
    verifyOtp: (phone: string, code: string) => login("/v1/auth/otp/verify", { phone, code }),
    providers: () => raw<AuthProviders>("GET", "/v1/auth/providers", undefined, false),
    requestEmailCode: (email: string) => raw<{ sent: true; retryAfter: number }>("POST", "/v1/auth/email/request", { email }, false),
    verifyEmailCode: (email: string, code: string) => login("/v1/auth/email/verify", { email, code }),
    googleLogin: (idToken: string) => login("/v1/auth/google", { idToken }),
    requestPhoneLink: (phone: string) => call<{ sent: true; retryAfter: number }>("POST", "/v1/me/phone/request", { phone }),
    verifyPhoneLink: (phone: string, code: string) => call<{ user: PublicUser }>("POST", "/v1/me/phone/verify", { phone, code }),
    requestEmailLink: (email: string) => call<{ sent: true; retryAfter: number }>("POST", "/v1/me/email/request", { email }),
    verifyEmailLink: (email: string, code: string) => call<{ user: PublicUser }>("POST", "/v1/me/email/verify", { email, code }),
    logout: async () => {
      const t = store.get();
      if (t) await raw("POST", "/v1/auth/logout", { refreshToken: t.refreshToken }, false).catch(() => undefined);
      store.set(null);
    },
    me: () => call<{ user: PublicUser }>("GET", "/v1/me"),
    updateMe: (patch: ProfileUpdate) => call<{ user: PublicUser }>("PATCH", "/v1/me", patch),
    listAddresses: () => call<{ addresses: Address[] }>("GET", "/v1/me/addresses"),
    addAddress: (a: AddressInput) => call<{ address: Address }>("POST", "/v1/me/addresses", a),
    updateAddress: (id: string, a: Partial<AddressInput>) => call<{ address: Address }>("PATCH", `/v1/me/addresses/${id}`, a),
    deleteAddress: (id: string) => call<void>("DELETE", `/v1/me/addresses/${id}`),
    modules: () => raw<{ modules: ModuleStatus[] }>("GET", "/v1/modules", undefined, false),
    /** Dev only (mock payment provider): returns what the Razorpay checkout would hand back. */
    mockPaymentSuccess: (providerOrderId: string) =>
      raw<{ confirmation: PaymentConfirmation }>("POST", `/v1/payments/mock/${encodeURIComponent(providerOrderId)}/succeed`, undefined, false),

    /** Is this account an admin, and does this session still need the authenticator code? */
    adminStatus: () => call<{ admin: boolean; needsCode: boolean; unlocked: boolean }>("GET", "/v1/admin/status"),
    adminUnlock: (code: string) => call<{ unlocked: true; until: string }>("POST", "/v1/admin/unlock", { code }),

    home: {
      cities: () => raw<{ cities: HomeCity[] }>("GET", `${H}/cities`, undefined, false),
      catalog: (city: string) =>
        raw<{ city: HomeCity; categories: HomeCategory[]; services: HomeService[] }>("GET", `${H}/catalog?city=${encodeURIComponent(city)}`, undefined, false),
      slots: (city: string, categoryId: string) =>
        raw<{ days: HomeSlotDay[] }>("GET", `${H}/slots?city=${encodeURIComponent(city)}&categoryId=${categoryId}`, undefined, false),
      createBooking: (b: HomeCreateBooking) => call<{ booking: HomeBooking; payment: HomePaymentStart | null }>("POST", `${H}/bookings`, b),
      bookings: () => call<{ bookings: HomeBooking[] }>("GET", `${H}/bookings`),
      booking: (id: string) => call<{ booking: HomeBooking }>("GET", `${H}/bookings/${id}`),
      pay: (id: string) => call<{ booking: HomeBooking; payment: HomePaymentStart }>("POST", `${H}/bookings/${id}/pay`, {}),
      confirmPayment: (id: string, c: PaymentConfirmation) => call<{ booking: HomeBooking }>("POST", `${H}/bookings/${id}/payment/confirm`, c),
      cancel: (id: string, reason?: string) => call<{ booking: HomeBooking }>("POST", `${H}/bookings/${id}/cancel`, { reason }),

      proMe: () => call<{ pro: HomePro | null }>("GET", `${H}/pro/me`),
      proApply: (p: HomeProApply) => call<{ pro: HomePro }>("POST", `${H}/pro/apply`, p),
      proJobs: () => call<{ available: HomeBooking[]; mine: HomeBooking[] }>("GET", `${H}/pro/jobs`),
      proAccept: (id: string) => call<{ booking: HomeBooking }>("POST", `${H}/pro/jobs/${id}/accept`, {}),
      proStatus: (id: string, status: "on_the_way" | "in_progress" | "completed", startCode?: string) =>
        call<{ booking: HomeBooking }>("POST", `${H}/pro/jobs/${id}/status`, { status, startCode }),
      proUpdate: (p: HomeProUpdate) => call<{ pro: HomePro }>("PATCH", `${H}/pro/me`, p),
      proUploadDoc: (kind: HomeProDocKind, mime: string, dataBase64: string) =>
        call<{ pro: HomePro }>("PUT", `${H}/pro/me/documents/${kind}`, { mime, dataBase64 }),
      proSetPayout: (p: HomeProPayoutInput) => call<{ pro: HomePro }>("PUT", `${H}/pro/me/payout`, p),
      proSubmit: () => call<{ pro: HomePro }>("POST", `${H}/pro/me/submit`, {}),
      proEarnings: () => call<HomeEarnings>("GET", `${H}/pro/earnings`),

      admin: {
        bookings: (status?: HomeBookingStatus) => call<{ bookings: HomeBooking[] }>("GET", `${H}/admin/bookings${status ? `?status=${status}` : ""}`),
        assign: (id: string, proId: string) => call<{ booking: HomeBooking }>("POST", `${H}/admin/bookings/${id}/assign`, { proId }),
        cancel: (id: string, reason: string) => call<{ booking: HomeBooking }>("POST", `${H}/admin/bookings/${id}/cancel`, { reason }),
        pros: () => call<{ pros: HomePro[] }>("GET", `${H}/admin/pros`),
        setProStatus: (id: string, status: "active" | "suspended") => call<{ pro: HomePro }>("PATCH", `${H}/admin/pros/${id}`, { status }),
        rejectPro: (id: string, reason: string) => call<{ pro: HomePro }>("POST", `${H}/admin/pros/${id}/reject`, { reason }),
        /** The KYC file itself (image or PDF). */
        proDocument: (id: string, kind: HomeProDocKind) => call<Blob>("GET", `${H}/admin/pros/${id}/documents/${kind}`),
        categories: () => call<{ categories: HomeAdminCategory[] }>("GET", `${H}/admin/categories`),
        setCommission: (id: string, commissionBps: number) =>
          call<{ category: HomeAdminCategory }>("PATCH", `${H}/admin/categories/${id}`, { commissionBps }),
        balances: () => call<{ pros: HomeProBalance[]; payouts: HomePayout[] }>("GET", `${H}/admin/payouts`),
        ledger: (proId: string) => call<HomeEarnings>("GET", `${H}/admin/pros/${proId}/ledger`),
        createPayout: (proId: string, amountPaise: number, note?: string) =>
          call<{ payout: HomePayout }>("POST", `${H}/admin/pros/${proId}/payouts`, { amountPaise, note }),
        markPayoutPaid: (id: string, utr: string) => call<{ payout: HomePayout }>("POST", `${H}/admin/payouts/${id}/paid`, { utr }),
        markPayoutFailed: (id: string, reason: string) => call<{ payout: HomePayout }>("POST", `${H}/admin/payouts/${id}/failed`, { reason }),
        adjust: (proId: string, amountPaise: number, note: string) =>
          call<{ balancePaise: number }>("POST", `${H}/admin/pros/${proId}/adjustments`, { amountPaise, note }),
        services: () => call<{ services: HomeService[] }>("GET", `${H}/admin/services`),
        updateService: (id: string, patch: { pricePaise?: number; active?: boolean }) =>
          call<{ service: HomeService }>("PATCH", `${H}/admin/services/${id}`, patch),
      },
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
