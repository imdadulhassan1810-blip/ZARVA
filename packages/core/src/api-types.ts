export interface PublicUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
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
