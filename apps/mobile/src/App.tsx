import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { buildMode, type AppMode } from "./api";
import { BrandPanel } from "./AuthScreen";
import { useTheme, type Theme } from "./theme";
import { haptic, Ionicons, type IconName } from "./ui";
import { CustomerApp } from "./customer/CustomerApp";
import { PartnerApp } from "./partner/PartnerApp";

/**
 * One codebase, two apps. Store builds are fixed by APP_VARIANT (see app.config.js):
 *  - "ZARVA" (customer): book services. No partner screens.
 *  - "ZARVA Partner" (partner): jobs, earnings, profile. No customer screens.
 * In development (Expo Go) there is no fixed variant, so a chooser picks which app to open.
 * Each screen handles its own safe areas (notch, home indicator), like a native app.
 */
export default function App() {
  const t = useTheme();
  const [mode, setMode] = useState<AppMode | null>(buildMode);
  const dev = buildMode === null;
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {mode === null && <Chooser t={t} onPick={setMode} />}
        {mode === "customer" && <CustomerApp t={t} onSwitchApp={dev ? () => setMode(null) : undefined} />}
        {mode === "partner" && <PartnerApp t={t} onSwitchApp={dev ? () => setMode(null) : undefined} />}
      </View>
    </SafeAreaProvider>
  );
}

/** Development only: a store build is already one app or the other. */
function Chooser({ t, onPick }: { t: Theme; onPick: (m: AppMode) => void }) {
  const option = (m: AppMode, icon: IconName, title: string, body: string, accent: string) => (
    <Pressable accessibilityRole="button" onPress={() => { haptic.impact(); onPick(m); }}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.border, transform: [{ scale: pressed ? 0.98 : 1 }] }, t.shadow]}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={26} color={m === "partner" ? t.onHome : "#fff"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.muted} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.ink }}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]}>
        <BrandPanel t={t} title="Which app?" subtitle="Development build. In the stores these are two separate apps." />
      </SafeAreaView>
      <ScrollView style={{ flex: 1, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {option("customer", "home", "ZARVA", "Book home services", t.primary)}
        {option("partner", "construct", "ZARVA Partner", "For service professionals", t.home)}
      </ScrollView>
    </View>
  );
}
