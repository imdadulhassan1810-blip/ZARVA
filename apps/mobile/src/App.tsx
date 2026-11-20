import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { logoRules, verticalIds, verticals } from "@zarva/brand";
import { formatPhone, phoneSchema, type ModuleStatus, type PublicUser } from "@zarva/core";
import { api, loadTokens } from "./api";
import { useTheme, type Theme } from "./theme";
import { Button, Field, Loading } from "./ui";

type Screen = "loading" | "login" | "home";

export default function App() {
  const t = useTheme();
  const [screen, setScreen] = useState<Screen>("loading");
  useEffect(() => {
    loadTokens().then((ok) => setScreen(ok ? "home" : "login"));
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={t.dark ? "light" : "dark"} />
        {screen === "loading" && <Loading />}
        {screen === "login" && <Login t={t} onDone={() => setScreen("home")} />}
        {screen === "home" && <Home t={t} onSignOut={() => setScreen("login")} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Logo({ t }: { t: Theme }) {
  // Horizontal lockup, kit minimum 120px wide.
  const src = t.dark ? require("../assets/lockup-dark.png") : require("../assets/lockup-light.png");
  return <Image source={src} style={{ width: 140, height: 40 }} resizeMode="contain" accessibilityLabel="ZARVA" />;
}

function Login({ t, onDone }: { t: Theme; onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Logo t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize["2xl"], fontWeight: "600", marginTop: 24 }}>Sign in</Text>
      <Text style={{ color: t.muted }}>We'll send a 6-digit code to your mobile number.</Text>
      {!sent ? (
        <>
          <Field t={t} label="Mobile number" keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" value={phone} onChangeText={setPhone} />
          <Button t={t} title={busy ? "Sending…" : "Send OTP"} disabled={busy} onPress={() => run(async () => {
            const p = phoneSchema.safeParse(phone);
            if (!p.success) throw new Error(p.error.issues[0]?.message);
            await api.requestOtp(p.data);
            setSent(true);
          })} />
        </>
      ) : (
        <>
          <Field t={t} label={`Code sent to ${phone}`} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={(s) => setCode(s.replace(/\D/g, ""))} />
          <Button t={t} title={busy ? "Checking…" : "Verify"} disabled={busy || code.length !== 6} onPress={() => run(async () => { await api.verifyOtp(phone, code); onDone(); })} />
          <Button t={t} ghost title="Change number" onPress={() => { setSent(false); setCode(""); }} />
        </>
      )}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
    </ScrollView>
  );
}

function Home({ t, onSignOut }: { t: Theme; onSignOut: () => void }) {
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
      <Text style={{ color: t.muted }}>{user ? formatPhone(user.phone) : ""} · {logoRules.tagline}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        {verticalIds.map((id) => {
          const m = byId.get(id);
          return (
            <View key={id} style={{ width: "47%", minHeight: 120, borderRadius: t.radius.lg, padding: 14, justifyContent: "flex-end", backgroundColor: verticals[id].flat }}>
              {!m?.enabled && <Text style={{ position: "absolute", top: 10, right: 10, color: "#fff", fontSize: 11, fontWeight: "600" }}>Coming soon</Text>}
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: t.fontSize.lg }}>{verticals[id].label}</Text>
              <Text style={{ color: "#fff", fontSize: t.fontSize.xs }}>{m?.tagline ?? ""}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 24 }}>
        <Button t={t} ghost title="Sign out" onPress={async () => { await api.logout(); onSignOut(); }} />
      </View>
    </ScrollView>
  );
}
