import { ApiClient } from "@oneapp/shared";

const TOKEN_KEY = "oneapp_token";
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const api = new ApiClient(BASE_URL, {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },
});

export function hasToken() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
