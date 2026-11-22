import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { buildMode, type AppMode } from "./api";
import type { LaunchView } from "./LaunchScreen";
import { useTheme } from "./theme";
import { CustomerApp } from "./customer/CustomerApp";
import { PartnerApp } from "./partner/PartnerApp";

/**
 * One codebase, two apps. Store builds are fixed by APP_VARIANT (see app.config.js):
 *  - "ZARVA" (customer): book services. No partner screens.
 *  - "ZARVA Partner" (partner): jobs, earnings, profile. No customer screens.
 * Signed out, each opens on the animated launch screen (LaunchScreen.tsx).
 * In development (Expo Go) there is no fixed variant: the customer app opens first, and its
 * "Partner sign up" button switches to the partner app in place (and back), so you can try both.
 * Each screen handles its own safe areas (notch, home indicator), like a native app.
 */
export default function App() {
  const t = useTheme();
  const [mode, setMode] = useState<AppMode>(buildMode ?? "customer");
  const [view, setView] = useState<LaunchView | undefined>(undefined);
  const dev = buildMode === null;
  const open = (m: AppMode) => (v?: LaunchView) => { setView(v); setMode(m); };
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {mode === "customer" && (
          <CustomerApp key="customer" t={t} initialView={view} onOtherApp={dev ? open("partner") : undefined} onSwitchApp={dev ? () => open("partner")() : undefined} />
        )}
        {mode === "partner" && <PartnerApp key="partner" t={t} initialView={view} onOtherApp={dev ? open("customer") : undefined} />}
      </View>
    </SafeAreaProvider>
  );
}
