import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { logoRules, verticalIds, verticals } from "@zarva/brand";
import { formatPhone, type ModuleStatus, type PublicUser } from "@zarva/core";
import { CodeForm } from "./CodeForm";
import { api, buildMode, loadTokens, type AppMode } from "./api";
import { useTheme, type Theme } from "./theme";
import { Button, Field, Loading } from "./ui";
import { HomeServices } from "./HomeServices";
import { PartnerApp } from "./partner/PartnerApp";

type Screen = "loading" | "login" | "home" | "home-services";

/**
 * One codebase, two apps. Store builds are fixed by APP_VARIANT (see app.config.js):
 *  - "ZARVA" (customer): book services. No partner screens.
 *  - "ZARVA Partner" (partner): jobs, earnings, profile. No customer screens.
 * In development (Expo Go) there is no fixed variant, so a chooser picks which app to open.
 */
export default function App() {
  const t = useTheme();
  const [mode, setMode] = useState<AppMode | null>(buildMode);
  const dev = buildMode === null;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={t.dark ? "light" : "dark"} />
        {mode === null && <Chooser t={t} onPick={setMode} />}
        {mode === "customer" && <CustomerApp t={t} onSwitchApp={dev ? () => setMode(null) : undefined} />}
        {mode === "partner" && <PartnerApp t={t} onSwitchApp={dev ? () => setMode(null) : undefined} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/** Development only: a store build is already one app or the other. */
function Chooser({ t, onPick }: { t: Theme; onPick: (m: AppMode) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Logo t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "600", marginTop: 24 }}>Which app?</Text>
      <Text style={{ color: t.muted }}>Development build. In the stores these are two separate apps.</Text>
      <Button t={t} title="ZARVA: book services" onPress={() => onPick("customer")} />
      <Button t={t} ghost title="ZARVA Partner: for professionals" onPress={() => onPick("partner")} />
    </ScrollView>
  );
}

function CustomerApp({ t, onSwitchApp }: { t: Theme; onSwitchApp?: () => void }) {
  const [screen, setScreen] = useState<Screen>("loading");
  useEffect(() => {
    loadTokens("customer").then((ok) => setScreen(ok ? "home" : "login"));
  }, []);
  return (
    <>
      {screen === "loading" && <Loading />}
      {screen === "login" && <Login t={t} onDone={() => setScreen("home")} onSwitchApp={onSwitchApp} />}
      {screen === "home" && <Home t={t} onSignOut={() => setScreen("login")} onOpen={(id) => id === "home" && setScreen("home-services")} />}
      {screen === "home-services" && <HomeServices t={t} onExit={() => setScreen("home")} />}
    </>
  );
}

function Logo({ t }: { t: Theme }) {
  // Horizontal lockup, kit minimum 120px wide.
  const src = t.dark ? require("../assets/lockup-dark.png") : require("../assets/lockup-light.png");
  return <Image source={src} style={{ width: 140, height: 40 }} resizeMode="contain" accessibilityLabel="ZARVA" />;
}

function Login({ t, onDone, onSwitchApp }: { t: Theme; onDone: () => void; onSwitchApp?: () => void }) {
  const [method, setMethod] = useState<"phone" | "email">("phone");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Logo t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize["2xl"], fontWeight: "600", marginTop: 24 }}>Sign in or sign up</Text>
      <Text style={{ color: t.muted }}>No password needed. We send a one-time code.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["phone", "email"] as const).map((m) => (
          <View key={m} style={{ flex: 1 }}>
            <Button t={t} ghost={method !== m} title={m === "phone" ? "Mobile" : "Email"} onPress={() => setMethod(m)} />
          </View>
        ))}
      </View>
      {method === "phone" ? (
        <CodeForm key="phone" t={t} kind="phone" onSend={(p) => api.requestOtp(p)} onVerify={async (p, c) => { await api.verifyOtp(p, c); onDone(); }} />
      ) : (
        <CodeForm key="email" t={t} kind="email" onSend={(e) => api.requestEmailCode(e)} onVerify={async (e, c) => { await api.verifyEmailCode(e, c); onDone(); }} />
      )}
      {onSwitchApp && <Button t={t} ghost title="Development: open ZARVA Partner instead" onPress={onSwitchApp} />}
    </ScrollView>
  );
}

function Home({ t, onSignOut, onOpen }: { t: Theme; onSignOut: () => void; onOpen: (id: string) => void }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(onSignOut);
    api.modules().then((r) => setModules(r.modules)).catch(() => {});
  }, [onSignOut]);
  const byId = new Map(modules.map((m) => [m.id, m]));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Logo t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "600", marginTop: 16 }}>
        {user?.name ? `Hi ${user.name}` : "Welcome"}
      </Text>
      <Text style={{ color: t.muted }}>{user ? formatPhone(user.phone) || user.email : ""} · {logoRules.tagline}</Text>
      {user && !user.phone && (
        <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: t.radius.md, padding: 14, gap: 10, backgroundColor: t.surface }}>
          <Text style={{ color: t.text, fontWeight: "600" }}>Add your mobile number to book services</Text>
          <Text style={{ color: t.muted }}>Professionals call you before they arrive.</Text>
          <CodeForm t={t} kind="phone" submitLabel="Add number" onSend={(p) => api.requestPhoneLink(p)} onVerify={async (p, c) => setUser((await api.verifyPhoneLink(p, c)).user)} />
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        {verticalIds.map((id) => {
          const m = byId.get(id);
          return (
            <Pressable key={id} accessibilityRole="button" disabled={!m?.enabled} onPress={() => onOpen(id)} style={{ width: "47%", minHeight: 120, borderRadius: t.radius.lg, padding: 14, justifyContent: "flex-end", backgroundColor: verticals[id].flat }}>
              {!m?.enabled && <Text style={{ position: "absolute", top: 10, right: 10, color: "#fff", fontSize: 11, fontWeight: "600" }}>Coming soon</Text>}
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: t.fontSize.lg }}>{verticals[id].label}</Text>
              <Text style={{ color: "#fff", fontSize: t.fontSize.xs }}>{m?.tagline ?? ""}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 24 }}>
        <Button t={t} ghost title="Sign out" onPress={async () => { await api.logout(); onSignOut(); }} />
      </View>
    </ScrollView>
  );
}
