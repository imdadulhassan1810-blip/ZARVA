import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import type { GoogleAuthConfig } from "@oneapp/shared";
import { api } from "../lib/api";
import { colors } from "../theme";

// Lets the in-app browser tab close itself and hand control back to the app once
// Google redirects back — required once per app, safe to call at module scope.
WebBrowser.maybeCompleteAuthSession();

interface Props {
  onCredential: (idToken: string) => void;
}

/**
 * Renders "Continue with Google" only once the backend has the OAuth client id this
 * platform needs (GOOGLE_CLIENT_ID / GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID in
 * the backend .env — see the README). Renders nothing otherwise; password login/register
 * still works fine either way. Split into an outer/inner pair so the auth-request hook —
 * which throws if its platform's client id is missing — only ever mounts once that id is
 * confirmed present, instead of being called unconditionally with a possibly-undefined one.
 */
export function GoogleSignInButton({ onCredential }: Props) {
  const [config, setConfig] = useState<GoogleAuthConfig | null>(null);

  useEffect(() => {
    api
      .getGoogleAuthConfig()
      .then(setConfig)
      .catch(() => setConfig({ enabled: false }));
  }, []);

  const platformClientId = Platform.select({
    ios: config?.iosClientId,
    android: config?.androidClientId,
    default: config?.clientId,
  });

  if (!config?.enabled || !platformClientId) return null;
  return <GoogleSignInButtonInner config={config} onCredential={onCredential} />;
}

function GoogleSignInButtonInner({ config, onCredential }: { config: GoogleAuthConfig; onCredential: (idToken: string) => void }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: config.clientId,
    iosClientId: config.iosClientId,
    androidClientId: config.androidClientId,
  });

  useEffect(() => {
    if (response?.type === "success" && response.params.id_token) {
      onCredential(response.params.id_token);
    }
  }, [response]);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.button} disabled={!request} onPress={() => promptAsync()}>
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 4 },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 11, color: colors.muted },
});
