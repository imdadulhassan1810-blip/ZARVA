import { useEffect, useRef, type ReactNode } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

// Closes Google's browser tab and returns to the app after sign-in.
WebBrowser.maybeCompleteAuthSession();

type Ids = { iosClientId?: string; androidClientId?: string; webClientId?: string };

/**
 * Google client ids for this build, from app.config.js (GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID,
 * GOOGLE_WEB_CLIENT_ID). Null when this platform has none, so the screen falls back to hiding Google.
 * Real Google sign-in needs a store or development build: Expo Go cannot receive Google's redirect.
 */
export function googleClientIds(): Ids | null {
  const e = (Constants.expoConfig?.extra ?? {}) as { googleIosClientId?: string; googleAndroidClientId?: string; googleWebClientId?: string };
  const ids: Ids = { iosClientId: e.googleIosClientId || undefined, androidClientId: e.googleAndroidClientId || undefined, webClientId: e.googleWebClientId || undefined };
  const mine = Platform.OS === "ios" ? ids.iosClientId : Platform.OS === "android" ? ids.androidClientId : ids.webClientId;
  return mine ? ids : null;
}

/** Opens Google's sign-in and hands back the ID token, which the API verifies against our client ids. */
export function GoogleLiveButton({ onToken, onError, children }: {
  onToken: (idToken: string) => void;
  onError: (message: string) => void;
  children: (start: () => void, ready: boolean) => ReactNode;
}) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest(googleClientIds() ?? {});
  // Handle each Google response once, even if the parent re-renders with new callbacks.
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (!response || handled.current === response) return;
    handled.current = response;
    if (response.type === "success") {
      const idToken = response.params.id_token;
      if (idToken) onToken(idToken);
      else onError("Google did not return a sign-in token. Please try again.");
    } else if (response.type === "error") {
      onError(response.error?.message ?? "Google sign-in failed");
    }
  }, [response, onToken, onError]);
  return <>{children(() => void prompt(), request !== null)}</>;
}
