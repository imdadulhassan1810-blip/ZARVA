export interface PublicUser {
  id: string;
  /** Verified mobile number, or null until the person adds one. Required before booking. */
  phone: string | null;
  name: string | null;
  /** Verified email, or null. */
  email: string | null;
  hasGoogle: boolean;
  preferredLanguage: "en" | "hi" | "bn";
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until accessToken expires. */
  expiresIn: number;
}

export interface Address {
  id: string;
  label: "home" | "work" | "other";
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface AuthProviders {
  phone: true;
  email: true;
  /** live: real Google button. mock: demo button that needs no Google keys (development only). off: hidden. */
  google: { mode: "live" | "mock" | "off"; clientId: string | null };
}

export type LoginResult = AuthTokens & { user: PublicUser; isNewUser: boolean };
