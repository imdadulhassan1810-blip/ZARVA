import type { Address, AdminAccount, AdminCreated, AdminLoginResult, AuthProviders, AuthTokens, LoginResult, PublicUser } from "./api-types";
import type { ModuleStatus } from "./modules";
import type { AddressInput, ProfileUpdate } from "./schemas";
import type {
  HomeAdminCategory, HomeBooking, HomeBookingStatus, HomeCategory, HomeCity, HomeCreateBooking, HomeEarnings, HomePayout, HomePro,
  HomeBookingReviewState, HomeProApply, HomeProBalance, HomeProDocKind, HomeProPayoutInput, HomeProUpdate, HomeRatingSummary, HomeReview,
  HomeReviewInput, HomeService, HomeSlotDay,
} from "./home";
import type { HomeCancelInfo, HomePartnerCancelStats, HomePolicy, HomePolicyInput } from "./home-policy";
import type { Feedback, FeedbackInput, SupportCreate, SupportStatus, SupportTicket } from "./support";

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

/**
 * Which app this client signs in to. Each app keeps its own tokens: a partner sign-in never opens
 * the customer app, and the server refuses the other app's screens ("wrong_portal").
 */
export type Portal = "customer" | "partner" | "admin";

/**
 * Where the long-lived refresh token lives. The phone apps keep it in the device's secure store
 * (the default: it travels in the TokenStore). The website hands sign-in, refresh and sign-out to
 * its own server, which keeps the refresh token in an httpOnly cookie that page scripts can't read.
 */
export interface SessionKeeper {
  /** Calls a sign-in endpoint (e.g. "/v1/auth/otp/verify") and returns its body without the refresh token. */
  login<R>(path: string, body: unknown): Promise<R>;
  refresh(): Promise<{ accessToken: string; expiresIn: number }>;
  logout(): Promise<void>;
}

/** Placeholder kept in the TokenStore when the real refresh token is held by a SessionKeeper. */
export const REFRESH_IN_COOKIE = "cookie";

/** Tiny typed client shared by web and mobile. Refreshes the access token once on 401. */
export function createApiClient(baseUrl: string, store: TokenStore, fetchImpl: typeof fetch = fetch, portal: Portal = "customer", keeper?: SessionKeeper) {
  const authBase = portal === "admin" ? "/v1/admin/auth" : "/v1/auth";
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

  // Refresh tokens rotate and a reused one ends the session (theft protection), so when several
  // requests hit an expired access token at once they must share ONE refresh, not race.
  let refreshing: Promise<void> | null = null;
  function refreshOnce(tokens: AuthTokens): Promise<void> {
    refreshing ??= (async () => {
      const fresh = keeper
        ? { ...(await keeper.refresh()), refreshToken: REFRESH_IN_COOKIE }
        : await raw<AuthTokens>("POST", `${authBase}/refresh`, { refreshToken: tokens.refreshToken }, false);
      store.set(fresh);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const sent = store.get();
    try {
      return await raw<T>(method, path, body);
    } catch (e) {
      const tokens = store.get();
      if (e instanceof ApiRequestError && e.status === 401 && tokens) {
        // Another request may already have refreshed while this one was in flight.
        if (tokens.accessToken === sent?.accessToken) {
          try {
            await refreshOnce(tokens);
          } catch {
            store.set(null);
            throw e;
          }
        }
        return raw<T>(method, path, body);
      }
      throw e;
    }
  }

  async function login<R extends AuthTokens = LoginResult>(path: string, body: unknown): Promise<R> {
    const r = keeper ? await keeper.login<R>(path, body) : await raw<R>("POST", path, body, false);
    store.set({ accessToken: r.accessToken, refreshToken: keeper ? REFRESH_IN_COOKIE : r.refreshToken, expiresIn: r.expiresIn });
    return r;
  }

  return {
    requestOtp: (phone: string) => raw<{ sent: true; retryAfter: number }>("POST", "/v1/auth/otp/request", { phone }, false),
    portal,
    verifyOtp: (phone: string, code: string) => login("/v1/auth/otp/verify", { phone, code, portal: portal === "partner" ? "partner" : "customer" }),
    providers: () => raw<AuthProviders>("GET", "/v1/auth/providers", undefined, false),
    requestEmailCode: (email: string) => raw<{ sent: true; retryAfter: number }>("POST", "/v1/auth/email/request", { email }, false),
    verifyEmailCode: (email: string, code: string) => login("/v1/auth/email/verify", { email, code }),
    googleLogin: (idToken: string) => login("/v1/auth/google", { idToken }),
    /** name: Apple gives it to the app only on the first sign-in, so pass it along when present. */
    appleLogin: (identityToken: string, name?: string) => login("/v1/auth/apple", { identityToken, ...(name ? { name } : {}) }),
    requestPhoneLink: (phone: string) => call<{ sent: true; retryAfter: number }>("POST", "/v1/me/phone/request", { phone }),
    verifyPhoneLink: (phone: string, code: string) => call<{ user: PublicUser }>("POST", "/v1/me/phone/verify", { phone, code }),
    requestEmailLink: (email: string) => call<{ sent: true; retryAfter: number }>("POST", "/v1/me/email/request", { email }),
    verifyEmailLink: (email: string, code: string) => call<{ user: PublicUser }>("POST", "/v1/me/email/verify", { email, code }),
    logout: async () => {
      const t = store.get();
      if (keeper) await keeper.logout().catch(() => undefined);
      else if (t) await raw("POST", `${authBase}/logout`, { refreshToken: t.refreshToken }, false).catch(() => undefined);
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

    /** Admin app only: ZARVA-issued username + password + 6-digit authenticator code. */
    adminLogin: (username: string, password: string, code?: string) => login<AdminLoginResult>("/v1/admin/auth/login", { username, password, code: code || undefined }),
    adminMe: () => call<{ admin: AdminAccount }>("GET", "/v1/admin/me"),
    adminChangePassword: (currentPassword: string, newPassword: string) => call<void>("POST", "/v1/admin/me/password", { currentPassword, newPassword }),
    adminTeam: () => call<{ admins: AdminAccount[] }>("GET", "/v1/admin/team"),
    adminCreate: (username: string, name: string) => call<AdminCreated>("POST", "/v1/admin/team", { username, name }),
    adminSetStatus: (id: string, status: "active" | "disabled") => call<{ admin: AdminAccount }>("PATCH", `/v1/admin/team/${id}`, { status }),

    /** Help & support (customer app) and the team's queue (admin app). */
    support: {
      create: (t: SupportCreate) => call<{ ticket: SupportTicket }>("POST", "/v1/support/tickets", t),
      tickets: (ref?: { module: "home"; referenceId: string }) =>
        call<{ tickets: SupportTicket[] }>("GET", `/v1/support/tickets${ref ? `?module=${ref.module}&referenceId=${ref.referenceId}` : ""}`),
      ticket: (id: string) => call<{ ticket: SupportTicket }>("GET", `/v1/support/tickets/${id}`),
      reply: (id: string, message: string) => call<{ ticket: SupportTicket }>("POST", `/v1/support/tickets/${id}/messages`, { message }),
      resolve: (id: string) => call<{ ticket: SupportTicket }>("POST", `/v1/support/tickets/${id}/resolve`, {}),
      feedback: (f: FeedbackInput) => call<{ id: string }>("POST", "/v1/support/feedback", f),
      admin: {
        tickets: (status?: SupportStatus) =>
          call<{ tickets: SupportTicket[]; counts: Record<SupportStatus, number> }>("GET", `/v1/admin/support/tickets${status ? `?status=${status}` : ""}`),
        ticket: (id: string) => call<{ ticket: SupportTicket }>("GET", `/v1/admin/support/tickets/${id}`),
        reply: (id: string, message: string, resolve = false) => call<{ ticket: SupportTicket }>("POST", `/v1/admin/support/tickets/${id}/messages`, { message, resolve }),
        setStatus: (id: string, status: SupportStatus) => call<{ ticket: SupportTicket }>("PATCH", `/v1/admin/support/tickets/${id}`, { status }),
        feedback: () => call<{ feedback: Feedback[] }>("GET", "/v1/admin/feedback"),
      },
    },

    home: {
      reviews: (q: { category?: string; limit?: number; minRating?: number; withComment?: boolean } = {}) => {
        const p = new URLSearchParams();
        if (q.category) p.set("category", q.category);
        if (q.limit) p.set("limit", String(q.limit));
        if (q.minRating) p.set("minRating", String(q.minRating));
        if (q.withComment) p.set("withComment", "true");
        const qs = p.toString();
        return raw<{ reviews: HomeReview[] }>("GET", `${H}/reviews${qs ? `?${qs}` : ""}`, undefined, false);
      },
      ratingSummary: () => raw<{ overall: HomeRatingSummary; categories: Record<string, HomeRatingSummary> }>("GET", `${H}/reviews/summary`, undefined, false),
      bookingReview: (id: string) => call<HomeBookingReviewState>("GET", `${H}/bookings/${id}/review`),
      submitReview: (id: string, r: HomeReviewInput) => call<HomeBookingReviewState>("PUT", `${H}/bookings/${id}/review`, r),
      /** The invoice PDF itself (website: save it as a file). */
      invoicePdf: (id: string) => call<Blob>("GET", `${H}/bookings/${id}/invoice.pdf`),
      /** A 15-minute link to the PDF that needs no sign-in (phone app: open it in the browser). Full URL. */
      invoiceLink: async (id: string) => {
        const r = await call<{ path: string; expiresInSeconds: number }>("POST", `${H}/bookings/${id}/invoice-link`, {});
        return { url: `${baseUrl}${r.path}`, expiresInSeconds: r.expiresInSeconds };
      },
      proReviews: () => call<{ summary: HomeRatingSummary; reviews: HomeReview[] }>("GET", `${H}/pro/reviews`),
      cities: () => raw<{ cities: HomeCity[] }>("GET", `${H}/cities`, undefined, false),
      catalog: (city: string) =>
        raw<{ city: HomeCity; categories: HomeCategory[]; services: HomeService[]; onlinePayment?: boolean; prepaidOnly?: boolean; policy?: HomePolicy }>("GET", `${H}/catalog?city=${encodeURIComponent(city)}`, undefined, false),
      slots: (city: string, categoryId: string) =>
        raw<{ days: HomeSlotDay[] }>("GET", `${H}/slots?city=${encodeURIComponent(city)}&categoryId=${categoryId}`, undefined, false),
      createBooking: (b: HomeCreateBooking) => call<{ booking: HomeBooking; payment: HomePaymentStart | null }>("POST", `${H}/bookings`, b),
      bookings: () => call<{ bookings: HomeBooking[] }>("GET", `${H}/bookings`),
      booking: (id: string) => call<{ booking: HomeBooking }>("GET", `${H}/bookings/${id}`),
      pay: (id: string) => call<{ booking: HomeBooking; payment: HomePaymentStart }>("POST", `${H}/bookings/${id}/pay`, {}),
      confirmPayment: (id: string, c: PaymentConfirmation) => call<{ booking: HomeBooking }>("POST", `${H}/bookings/${id}/payment/confirm`, c),
      /** Pass the refund the customer was shown: if it changed meanwhile the API answers quote_changed (409). */
      cancel: (id: string, reason?: string, expectedRefundPaise?: number) =>
        call<{ booking: HomeBooking }>("POST", `${H}/bookings/${id}/cancel`, { reason, expectedRefundPaise }),
      cancelQuote: (id: string) => call<{ cancelInfo: HomeCancelInfo }>("GET", `${H}/bookings/${id}/cancel-quote`),
      reschedule: (id: string, slotStart: string) => call<{ booking: HomeBooking }>("POST", `${H}/bookings/${id}/reschedule`, { slotStart }),

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
      proCancelStats: () => call<{ cancelStats: HomePartnerCancelStats }>("GET", `${H}/pro/cancel-stats`),
      proCancel: (id: string, reason: string) => call<{ cancelStats: HomePartnerCancelStats }>("POST", `${H}/pro/jobs/${id}/cancel`, { reason }),

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
        policy: () => call<{ policy: HomePolicy }>("GET", `${H}/admin/policy`),
        setPolicy: (p: HomePolicyInput) => call<{ policy: HomePolicy }>("PUT", `${H}/admin/policy`, p),
        reviews: (q: { hidden?: boolean; maxRating?: number } = {}) =>
          call<{ reviews: HomeReview[] }>("GET", `${H}/admin/reviews?${q.hidden === undefined ? "" : `hidden=${q.hidden}&`}${q.maxRating ? `maxRating=${q.maxRating}` : ""}`),
        hideReview: (id: string, reason: string) => call<{ review: HomeReview }>("POST", `${H}/admin/reviews/${id}/hide`, { reason }),
        unhideReview: (id: string) => call<{ review: HomeReview }>("POST", `${H}/admin/reviews/${id}/unhide`, {}),
        invoicePdf: (bookingId: string) => call<Blob>("GET", `${H}/admin/bookings/${bookingId}/invoice.pdf`),
        updateService: (id: string, patch: { pricePaise?: number; active?: boolean }) =>
          call<{ service: HomeService }>("PATCH", `${H}/admin/services/${id}`, patch),
      },
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
