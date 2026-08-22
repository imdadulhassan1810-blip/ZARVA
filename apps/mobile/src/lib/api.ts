import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { ApiClient } from "@oneapp/shared";

const TOKEN_KEY = "oneapp_token";

// Set EXPO_PUBLIC_API_URL, or edit `extra.apiUrl` in app.json, to point at your
// backend. Note: on an Android emulator "localhost" refers to the emulator itself,
// not your host machine — use 10.0.2.2 there; on a physical device use your
// computer's LAN IP.
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://localhost:4000";

export const api = new ApiClient(BASE_URL, {
  get: () => AsyncStorage.getItem(TOKEN_KEY),
  set: (token) => (token ? AsyncStorage.setItem(TOKEN_KEY, token) : AsyncStorage.removeItem(TOKEN_KEY)),
});

export async function hasToken() {
  return Boolean(await AsyncStorage.getItem(TOKEN_KEY));
}
