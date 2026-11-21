import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { logoRules } from "@zarva/brand";
import { CodeForm } from "./CodeForm";
import type { Theme } from "./theme";
import { Button, Ionicons, Logo, Segmented, type IconName } from "./ui";

/**
 * Sign-in screen for both apps: an ink brand panel on top, the form on a sheet below.
 * The customer app offers mobile or email; the partner app offers mobile only.
 */
export function AuthScreen({
  t, badge, title, subtitle, perks, email, onPhone, devSwitch,
}: {
  t: Theme; badge?: string; title: string; subtitle: string; perks: { icon: IconName; text: string }[];
  email?: { send: (e: string) => Promise<unknown>; verify: (e: string, c: string) => Promise<void> };
  onPhone: { send: (p: string) => Promise<unknown>; verify: (p: string, c: string) => Promise<void> };
  devSwitch?: { label: string; onPress: () => void };
}) {
  const [method, setMethod] = useState<"phone" | "email">("phone");
  return (
    <View style={{ flex: 1, backgroundColor: t.ink }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <SafeAreaView edges={["top"]}>
            <BrandPanel t={t} badge={badge} title={title} subtitle={subtitle} perks={perks} />
          </SafeAreaView>
          <SafeAreaView edges={["bottom"]} style={{ flexGrow: 1, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -4 }}>
            <View style={{ padding: 20, gap: 18 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>Sign in or sign up</Text>
                <Text style={{ color: t.muted }}>No password needed. We send you a one-time code.</Text>
              </View>
              {email && (
                <Segmented t={t} value={method} onChange={setMethod} options={[{ value: "phone", label: "Mobile" }, { value: "email", label: "Email" }]} />
              )}
              {method === "phone" || !email ? (
                <CodeForm key="phone" t={t} kind="phone" onSend={onPhone.send} onVerify={onPhone.verify} />
              ) : (
                <CodeForm key="email" t={t} kind="email" onSend={email.send} onVerify={email.verify} />
              )}
              <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>By continuing you agree to ZARVA&apos;s terms and privacy policy.</Text>
              {devSwitch && <Button t={t} variant="plain" size="md" icon="swap-horizontal" title={devSwitch.label} onPress={devSwitch.onPress} />}
            </View>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The ink panel with the warm glow from the web landing page. Same in light and dark mode. */
export function BrandPanel({ t, badge, title, subtitle, perks }: { t: Theme; badge?: string; title: string; subtitle: string; perks?: { icon: IconName; text: string }[] }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 14, overflow: "hidden" }}>
      <Glow t={t} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Logo t={t} onInk />
        {badge && (
          <LinearGradient colors={[t.homeFrom, t.homeTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: t.onHome, fontWeight: "800", fontSize: 11, letterSpacing: 0.8 }}>{badge}</Text>
          </LinearGradient>
        )}
      </View>
      <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: -0.6, lineHeight: 36, marginTop: 12 }}>{title}</Text>
      <Text style={{ color: "#CFCAE8", fontSize: 15, lineHeight: 21 }}>{subtitle}</Text>
      {perks && (
        <View style={{ gap: 10, marginTop: 4 }}>
          {perks.map((p) => (
            <View key={p.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,197,77,0.16)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={p.icon} size={15} color="#FFD27A" />
              </View>
              <Text style={{ color: "#EDEAFB", fontSize: 14, flex: 1 }}>{p.text}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={{ color: "#8E88B0", fontSize: 12, marginTop: 4 }}>{logoRules.tagline}</Text>
    </View>
  );
}

/** Two soft colour blobs standing in for the web hero's radial gradients. */
export function Glow({ t }: { t: Theme }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ position: "absolute", right: -120, bottom: -160, width: 340, height: 340, borderRadius: 170, backgroundColor: t.homeFrom, opacity: 0.13 }} />
      <View style={{ position: "absolute", right: -60, bottom: -90, width: 200, height: 200, borderRadius: 100, backgroundColor: t.homeTo, opacity: 0.12 }} />
      <View style={{ position: "absolute", left: -100, top: -120, width: 280, height: 280, borderRadius: 140, backgroundColor: t.primaryFrom, opacity: 0.14 }} />
    </View>
  );
}
