import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer, useFocusEffect } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { setStatusBarStyle } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import {
  formatPhone, formatRupees, HOME_DOC_RULES, homeLedgerLabel, homeProDocLabel, homeProIdTypeLabel, homeProIdTypes, homeProRequiredDocs,
  type HomeBooking, type HomeCategory, type HomeEarnings, type HomePro, type HomeProDocKind, type HomeProIdType,
} from "@zarva/core";
import { Glow } from "../Glow";
import { LaunchScreen, type LaunchView } from "../LaunchScreen";
import { partnerApi as api, loadTokens } from "../api";
import { navTheme, tabListeners, tabOptions } from "../nav";
import type { Theme } from "../theme";
import {
  Button, Card, Chip, ConfirmSheet, EmptyState, ErrorBanner, Field, Group, haptic, IconButton, Ionicons, ListRow, Loading, Logo,
  Pill, Segmented, Sheet, SkeletonCard, StickyFooter, type IconName,
} from "../ui";

/**
 * ZARVA Partner: the service professional's app. Its own sign-in (mobile number), its own tabs
 * (Jobs, Earnings, Profile) and nothing from the customer app. One phone number can also have a
 * customer account, but that lives in the ZARVA app, never here.
 */
export function PartnerApp({ t, onOtherApp, initialView }: {
  t: Theme;
  /** Development only: the sign-in screen's "Customer sign up" opens the customer app in place. */
  onOtherApp?: (view: LaunchView) => void;
  initialView?: LaunchView;
}) {
  const [state, setState] = useState<"loading" | "login" | "in">("loading");
  useEffect(() => { void loadTokens("partner").then((ok) => setState(ok ? "in" : "login")); }, []);
  if (state === "loading") return <View style={{ flex: 1, backgroundColor: t.bg }}><Loading /></View>;
  if (state === "login") {
    return <LaunchScreen t={t} app="partner" client={api} initialView={initialView} onSignedIn={() => setState("in")} onOtherApp={onOtherApp} />;
  }
  return <PartnerMain t={t} onSignedOut={() => setState("login")} />;
}

interface PartnerSession { t: Theme; pro: HomePro; setPro: (p: HomePro) => void; cats: HomeCategory[]; signOut: () => void }
const Ctx = createContext<PartnerSession | null>(null);
const useP = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("outside PartnerMain");
  return c;
};

const Tabs = createBottomTabNavigator<{ Jobs: undefined; Earnings: undefined; Profile: undefined }>();

function PartnerMain({ t, onSignedOut }: { t: Theme; onSignedOut: () => void }) {
  const [pro, setPro] = useState<HomePro | null | undefined>(undefined);
  const [cats, setCats] = useState<HomeCategory[]>([]);
  const [confirmOut, setConfirmOut] = useState(false);

  const signOut = useCallback(async () => { await api.logout().catch(() => {}); onSignedOut(); }, [onSignedOut]);

  useEffect(() => {
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
    api.home.proMe().then((r) => setPro(r.pro)).catch(() => void signOut());
  }, [signOut]);

  const askSignOut = () => setConfirmOut(true);
  const out = <ConfirmSheet t={t} visible={confirmOut} onClose={() => setConfirmOut(false)} destructive title="Sign out of ZARVA Partner?" confirm="Sign out" cancel="Stay signed in" onConfirm={() => void signOut()} />;

  if (pro === undefined) return <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}><SkeletonCard t={t} /><SkeletonCard t={t} lines={5} /></View>;
  if (pro === null || pro.status === "draft" || pro.status === "rejected") {
    return <>{<Onboarding t={t} pro={pro} cats={cats} onChange={setPro} onSignOut={askSignOut} />}{out}</>;
  }
  if (pro.status === "pending" || pro.status === "suspended") return <>{<Waiting t={t} pro={pro} onPro={setPro} onSignOut={askSignOut} />}{out}</>;

  return (
    <Ctx.Provider value={{ t, pro, setPro, cats, signOut: askSignOut }}>
      <NavigationContainer theme={navTheme(t)}>
        {/* The partner app's own menu. Nothing from the customer app. */}
        <Tabs.Navigator
          screenOptions={tabOptions(t, { Jobs: ["briefcase", "briefcase-outline"], Earnings: ["wallet", "wallet-outline"], Profile: ["person-circle", "person-circle-outline"] })}
          screenListeners={tabListeners}
        >
          <Tabs.Screen name="Jobs" component={JobsScreen} options={{ headerShown: false }} />
          <Tabs.Screen name="Earnings" component={EarningsScreen} options={{ headerShown: false }} />
          <Tabs.Screen name="Profile" component={ProfileScreen} />
        </Tabs.Navigator>
      </NavigationContainer>
      {out}
    </Ctx.Provider>
  );
}

/** Ink header shared by Jobs and Earnings, with the PARTNER badge. */
function InkHeader({ t, children }: { t: Theme; children?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  useFocusEffect(useCallback(() => {
    setStatusBarStyle("light");
    return () => setStatusBarStyle(t.dark ? "light" : "dark");
  }, [t.dark]));
  return (
    <View style={{ backgroundColor: t.ink, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden", gap: 14 }}>
      <Glow t={t} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Logo t={t} onInk />
        <View style={{ backgroundColor: t.home, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: t.onHome, fontWeight: "800", fontSize: 11, letterSpacing: 0.8 }}>PARTNER</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const when = (b: HomeBooking) =>
  new Date(b.slotStart).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const items = (b: HomeBooking) => b.items.map((i) => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(", ");
const stage: Record<string, { label: string; icon: IconName }> = {
  assigned: { label: "Accepted", icon: "checkmark-circle" },
  on_the_way: { label: "On the way", icon: "bicycle" },
  in_progress: { label: "In progress", icon: "construct" },
};

/* ---------------- Jobs ---------------- */
function JobsScreen() {
  const { t, pro } = useP();
  const [jobs, setJobs] = useState<{ available: HomeBooking[]; mine: HomeBooking[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [codeFor, setCodeFor] = useState<HomeBooking | null>(null);
  const [cashFor, setCashFor] = useState<HomeBooking | null>(null);
  const load = useCallback(() => api.home.proJobs().then((j) => { setJobs(j); setError(null); }).catch((e: Error) => { setError(e.message); setJobs((x) => x ?? { available: [], mine: [] }); }), []);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try { await fn(); haptic.success(); await load(); return true; } catch (e) { haptic.error(); setError((e as Error).message); return false; } finally { setBusy(null); }
  }

  const action = (b: HomeBooking) => {
    if (b.status === "assigned") return <Button t={t} icon="navigate" title="I'm on the way" loading={busy === b.id} onPress={() => void run(b.id, () => api.home.proStatus(b.id, "on_the_way"))} />;
    if (b.status === "on_the_way") return <Button t={t} icon="keypad" title="Start job" loading={busy === b.id} onPress={() => setCodeFor(b)} />;
    if (b.status === "in_progress") {
      const cash = b.payMode === "after_service";
      return <Button t={t} variant="home" icon="checkmark-done" loading={busy === b.id} title={cash ? `Collect ${formatRupees(b.totalPaise)} · Complete` : "Mark complete"}
        onPress={() => (cash ? setCashFor(b) : void run(b.id, () => api.home.proStatus(b.id, "completed")))} />;
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#fff" colors={[t.primary]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <InkHeader t={t}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }}>Hi {pro.name.split(" ")[0]}</Text>
            <Text style={{ color: "#CFCAE8" }}>{pro.locality ?? "Durgapur"}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Jobs done" value={String(pro.jobsDone)} />
            <Stat label="Today & upcoming" value={jobs ? String(jobs.mine.length) : "–"} />
            <Stat label="Open near you" value={jobs ? String(jobs.available.length) : "–"} />
          </View>
        </InkHeader>

        <View style={{ padding: 16, gap: 12 }}>
          {error && <ErrorBanner t={t} message={error} onRetry={() => void load()} />}
          <Text style={{ color: t.text, fontSize: 19, fontWeight: "800" }}>Your jobs</Text>
          {jobs === null ? <SkeletonCard t={t} lines={4} />
            : jobs.mine.length === 0 ? <Card t={t}><Text style={{ color: t.muted }}>No jobs yet. Accept one below.</Text></Card>
              : jobs.mine.map((b) => (
                <Card key={b.id} t={t} style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Pill t={t} label={stage[b.status]?.label ?? b.statusLabel} icon={stage[b.status]?.icon} color={b.status === "in_progress" ? t.primary : b.status === "on_the_way" ? t.info : t.success} />
                    <Text style={{ color: t.muted, fontSize: 12 }}>{b.code}</Text>
                  </View>
                  <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>{when(b)}</Text>
                  <Text style={{ color: t.text }}>{items(b)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.surface2 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: t.text, fontWeight: "700" }}>{b.address.name}</Text>
                      <Text style={{ color: t.muted, fontSize: 13 }}>{[b.address.line1, b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</Text>
                    </View>
                    <IconButton t={t} icon="call" label={`Call ${b.address.name}`} color="#fff" bg={t.success} onPress={() => void Linking.openURL(`tel:${b.address.phone}`)} />
                  </View>
                  {b.customerNote ? <Text style={{ color: t.text }}><Text style={{ fontWeight: "700" }}>Note: </Text>{b.customerNote}</Text> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name={b.payMode === "after_service" ? "cash-outline" : "card-outline"} size={16} color={b.payMode === "after_service" ? t.warning : t.success} />
                    <Text style={{ color: t.muted, fontSize: 13 }}>{b.payMode === "after_service" ? `Collect ${formatRupees(b.totalPaise)} from the customer` : "Paid online, collect nothing"}</Text>
                  </View>
                  {action(b)}
                </Card>
              ))}

          <Text style={{ color: t.text, fontSize: 19, fontWeight: "800", marginTop: 8 }}>New jobs near you</Text>
          {jobs === null ? <SkeletonCard t={t} />
            : jobs.available.length === 0 ? <EmptyState t={t} icon="briefcase-outline" title="No open jobs right now" body="Pull down to refresh. New jobs also appear here on their own." />
              : jobs.available.map((b) => (
                <Card key={b.id} t={t} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{when(b)}</Text>
                      <Text style={{ color: t.text }}>{items(b)}</Text>
                    </View>
                    <Text style={{ color: t.text, fontWeight: "800", fontSize: 20 }}>{formatRupees(b.totalPaise)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="location-outline" size={15} color={t.muted} />
                    <Text style={{ color: t.muted, fontSize: 13, flex: 1 }}>{[b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</Text>
                  </View>
                  <Button t={t} variant="home" icon="checkmark" title="Accept job" loading={busy === b.id} disabled={busy !== null && busy !== b.id} onPress={() => void run(b.id, () => api.home.proAccept(b.id))} />
                </Card>
              ))}
        </View>
      </ScrollView>

      <StartCodeSheet t={t} job={codeFor} busy={busy !== null} onClose={() => setCodeFor(null)}
        onSubmit={async (code) => { const b = codeFor!; if (await run(b.id, () => api.home.proStatus(b.id, "in_progress", code))) setCodeFor(null); }} />
      <ConfirmSheet t={t} visible={cashFor !== null} onClose={() => setCashFor(null)}
        title="Cash collected?" body={cashFor ? `Did you collect ${formatRupees(cashFor.totalPaise)} from the customer?` : ""}
        confirm="Yes, complete job" cancel="Not yet"
        onConfirm={() => { const b = cashFor!; void run(b.id, () => api.home.proStatus(b.id, "completed")); }} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: "#B9B4D6", fontSize: 12 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Four big boxes for the customer's start code. */
function StartCodeSheet({ t, job, busy, onClose, onSubmit }: { t: Theme; job: HomeBooking | null; busy: boolean; onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  useEffect(() => { if (job) setCode(""); }, [job]);
  return (
    <Sheet t={t} visible={job !== null} onClose={onClose} title="Enter start code">
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={{ color: t.muted }}>Ask {job?.address.name ?? "the customer"} for the 4-digit code shown in their ZARVA app.</Text>
        <View>
          <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: 60, height: 68, borderRadius: 14, borderWidth: 2, borderColor: code.length === i ? t.primary : t.border, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.text, fontSize: 30, fontWeight: "800" }}>{code[i] ?? ""}</Text>
              </View>
            ))}
          </View>
          <TextInput accessibilityLabel="Start code" autoFocus keyboardType="number-pad" maxLength={4} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} caretHidden
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, fontSize: 30 }} />
        </View>
        <Button t={t} title="Start job" loading={busy} disabled={code.length !== 4} onPress={() => onSubmit(code)} />
      </View>
    </Sheet>
  );
}

/* ---------------- Earnings ---------------- */
function EarningsScreen() {
  const { t } = useP();
  const [e, setE] = useState<HomeEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => api.home.proEarnings().then((x) => { setE(x); setError(null); }).catch((x: Error) => setError(x.message)), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const owes = (e?.balancePaise ?? 0) < 0;
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#fff" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <InkHeader t={t}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#CFCAE8" }}>{e ? (owes ? "You owe ZARVA (cash collected)" : "ZARVA owes you") : "Balance"}</Text>
          <Text style={{ color: owes ? "#FF9AA5" : "#fff", fontSize: 40, fontWeight: "800", letterSpacing: -1 }}>{e ? formatRupees(Math.abs(e.balancePaise)) : "–"}</Text>
          <Text style={{ color: "#B9B4D6", fontSize: 13 }}>ZARVA settles your balance every week.</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat label="Last 7 days" value={e ? formatRupees(e.weekPaise) : "–"} />
          <Stat label="Jobs this week" value={e ? String(e.jobsThisWeek) : "–"} />
        </View>
      </InkHeader>
      <View style={{ padding: 16, gap: 12 }}>
        {error && <ErrorBanner t={t} message={error} onRetry={() => void load()} />}
        <Text style={{ color: t.text, fontSize: 19, fontWeight: "800" }}>Payouts</Text>
        {!e ? <SkeletonCard t={t} lines={2} /> : e.payouts.length === 0 ? <Card t={t}><Text style={{ color: t.muted }}>No payouts yet. ZARVA pays your balance every week.</Text></Card> : (
          <Group t={t}>
            {e.payouts.map((p, i) => (
              <ListRow key={p.id} t={t} icon={p.status === "paid" ? "checkmark-circle-outline" : p.status === "failed" ? "alert-circle-outline" : "time-outline"}
                title={formatRupees(p.amountPaise)}
                subtitle={`${new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${p.destination}${p.utr ? ` · Ref ${p.utr}` : ""}`}
                value={{ processing: "Sending", manual: "To pay", paid: "Paid", failed: "Failed" }[p.status]} last={i === e.payouts.length - 1} />
            ))}
          </Group>
        )}
        <Text style={{ color: t.text, fontSize: 19, fontWeight: "800", marginTop: 8 }}>History</Text>
        {!e ? <SkeletonCard t={t} /> : e.entries.length === 0 ? <EmptyState t={t} icon="receipt-outline" title="Nothing yet" body="Earnings appear here when you complete a job." /> : (
          <Group t={t}>
            {e.entries.map((x, i) => (
              <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i === e.entries.length - 1 ? 0 : 1, borderColor: t.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: x.amountPaise < 0 ? (t.dark ? "#3B1D22" : "#FFE7E5") : (t.dark ? "#14352A" : "#E2F7EE") }}>
                  <Ionicons name={x.amountPaise < 0 ? "arrow-up" : "arrow-down"} size={17} color={x.amountPaise < 0 ? t.danger : t.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }}>{homeLedgerLabel[x.kind]}{x.bookingCode ? ` · ${x.bookingCode}` : ""}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{new Date(x.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
                </View>
                <Text style={{ color: x.amountPaise < 0 ? t.danger : t.success, fontWeight: "800" }}>{x.amountPaise > 0 ? "+" : x.amountPaise < 0 ? "−" : ""}{formatRupees(Math.abs(x.amountPaise))}</Text>
              </View>
            ))}
          </Group>
        )}
      </View>
    </ScrollView>
  );
}

/* ---------------- Profile ---------------- */
function ProfileScreen() {
  const { t, pro, setPro, cats, signOut } = useP();
  const [edit, setEdit] = useState(false);
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      <Card t={t} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.home, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.onHome, fontWeight: "800", fontSize: 22 }}>{pro.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{pro.name}</Text>
          <Pill t={t} label="Verified partner" icon="shield-checkmark" color={t.success} />
        </View>
      </Card>
      <Group t={t}>
        <ListRow t={t} icon="call-outline" title="Mobile" value={formatPhone(pro.phone)} />
        <ListRow t={t} icon="construct-outline" title="Work" subtitle={pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "-"} />
        <ListRow t={t} icon="location-outline" title="Area" value={pro.locality ?? "Durgapur"} />
        <ListRow t={t} icon="trophy-outline" title="Jobs done" value={String(pro.jobsDone)} last />
      </Group>
      <Group t={t}>
        <ListRow t={t} icon="wallet-outline" title="Payout account" subtitle={pro.payout.upi ?? pro.payout.bankAccountMasked ?? "Not set"} onPress={() => setEdit(true)} last />
      </Group>
      <Text style={{ color: t.muted, fontSize: 13, paddingHorizontal: 4 }}>To change your work or area, call ZARVA partner support.</Text>
      <Group t={t}>
        <ListRow t={t} icon="log-out-outline" title="Sign out" danger onPress={signOut} last />
      </Group>
      <Sheet t={t} visible={edit} onClose={() => setEdit(false)} title="Payout account">
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <PayoutForm t={t} pro={pro} submitLabel="Save payout account" onSaved={(p) => { setPro(p); setEdit(false); }} />
        </ScrollView>
      </Sheet>
    </ScrollView>
  );
}

function PayoutForm({ t, pro, onSaved, submitLabel = "Save and continue" }: { t: Theme; pro: HomePro; onSaved: (p: HomePro) => void; submitLabel?: string }) {
  const [mode, setMode] = useState<"upi" | "bank">(pro.payout.bankAccountMasked && !pro.payout.upi ? "bank" : "upi");
  const [accountName, setAccountName] = useState(pro.payout.accountName ?? pro.name);
  const [upi, setUpi] = useState(pro.payout.upi ?? "");
  const [bank, setBank] = useState("");
  const [ifsc, setIfsc] = useState(pro.payout.ifsc ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <Segmented t={t} value={mode} onChange={setMode} options={[{ value: "upi", label: "UPI" }, { value: "bank", label: "Bank account" }]} />
      <Field t={t} label="Account holder name" icon="person-outline" value={accountName} onChangeText={setAccountName} />
      {mode === "upi"
        ? <Field t={t} label="UPI ID" icon="at" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="yourname@okaxis" />
        : <>
          <Field t={t} label={`Account number${pro.payout.bankAccountMasked ? ` (now ${pro.payout.bankAccountMasked})` : ""}`} icon="card-outline" value={bank} onChangeText={(v) => setBank(v.replace(/\D/g, ""))} keyboardType="number-pad" />
          <Field t={t} label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="SBIN0001234" />
        </>}
      {error && <ErrorBanner t={t} message={error} />}
      <Button t={t} title={submitLabel} loading={busy} onPress={async () => {
        setError(null);
        setBusy(true);
        try {
          const body = mode === "upi" ? { accountName: accountName.trim(), upi: upi.trim() } : { accountName: accountName.trim(), bankAccount: bank, ifsc: ifsc.trim() };
          onSaved((await api.home.proSetPayout(body)).pro);
          haptic.success();
        } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(false); }
      }} />
    </View>
  );
}

/* ---------------- Waiting for approval ---------------- */
function Waiting({ t, pro, onPro, onSignOut }: { t: Theme; pro: HomePro; onPro: (p: HomePro) => void; onSignOut: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const check = async () => { setRefreshing(true); await api.home.proMe().then((r) => { if (r.pro) onPro(r.pro); }).catch(() => {}); setRefreshing(false); };
  const pending = pro.status === "pending";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void check()} />}>
        <Logo t={t} />
        <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: pending ? t.tints[0] : t.tints[3], alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={pending ? "hourglass" : "pause-circle"} size={44} color={pending ? t.warning : t.danger} />
          </View>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", textAlign: "center" }}>{pending ? `Thanks, ${pro.name.split(" ")[0]}` : `Hi ${pro.name.split(" ")[0]}`}</Text>
          <Text style={{ color: t.muted, textAlign: "center", fontSize: 15, lineHeight: 22 }}>
            {pending
              ? "We are checking your documents. This usually takes up to 2 working days. You will get an SMS when you are approved, and then jobs appear here."
              : "Your profile is suspended. Please call ZARVA partner support."}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Button t={t} icon="refresh" title="Check again" loading={refreshing} onPress={() => void check()} />
        <Button t={t} variant="plain" title="Sign out" onPress={onSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Onboarding ---------------- */
type Step = "details" | "documents" | "payout" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Your work" }, { id: "documents", label: "ID & photo" }, { id: "payout", label: "Payout" }, { id: "review", label: "Submit" },
];

/** Partner sign-up on the phone: the same 4 steps as the partner website, saved after each step. */
function Onboarding({ t, pro, cats, onChange, onSignOut }: { t: Theme; pro: HomePro | null; cats: HomeCategory[]; onChange: (p: HomePro) => void; onSignOut: () => void }) {
  const first: Step = !pro ? "details" : pro.documents.length < homeProRequiredDocs.length ? "documents" : !pro.payout.upi && !pro.payout.bankAccountMasked ? "payout" : "review";
  const [step, setStep] = useState<Step>(first);
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderColor: t.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {idx > 0 ? <IconButton t={t} icon="chevron-back" label="Back" onPress={() => setStep(STEPS[idx - 1]!.id)} /> : <View style={{ width: 4 }} />}
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>STEP {idx + 1} OF {STEPS.length}</Text>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{STEPS[idx]!.label}</Text>
          </View>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onSignOut}><Text style={{ color: t.muted, fontWeight: "700" }}>Sign out</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((s, i) => <View key={s.id} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= idx ? t.home : t.border }} />)}
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {step === "details" && <Details t={t} pro={pro} cats={cats} onSaved={(p) => { onChange(p); setStep("documents"); }} />}
        {step === "documents" && pro && <Documents t={t} pro={pro} onChange={onChange} onNext={() => setStep("payout")} />}
        {step === "payout" && pro && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: t.muted }}>Where should ZARVA send your weekly earnings?</Text>
            <PayoutForm t={t} pro={pro} onSaved={(p) => { onChange(p); setStep("review"); }} />
          </ScrollView>
        )}
        {step === "review" && pro && <Review t={t} pro={pro} cats={cats} onChange={onChange} go={setStep} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Details({ t, pro, cats, onSaved }: { t: Theme; pro: HomePro | null; cats: HomeCategory[]; onSaved: (p: HomePro) => void }) {
  const [name, setName] = useState(pro?.name ?? "");
  const [locality, setLocality] = useState(pro?.locality ?? "");
  const [years, setYears] = useState(pro?.experienceYears != null ? String(pro.experienceYears) : "");
  const [idType, setIdType] = useState<HomeProIdType | "">(pro?.idType ?? "");
  const [picked, setPicked] = useState<string[]>(pro?.categoryIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {pro?.status === "rejected" && <ErrorBanner t={t} message={`We need a fix before we can approve you: ${pro.rejectionReason ?? ""}`} />}
        <Text style={{ color: t.muted }}>Takes about 5 minutes. Your progress is saved after every step.</Text>
        <Field t={t} label="Full name (as on your ID)" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" />
        <Field t={t} label="Your area in Durgapur" icon="location-outline" value={locality} onChangeText={setLocality} placeholder="e.g. Benachity, City Centre" />
        <Text style={{ color: t.text, fontWeight: "600" }}>What work do you do?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {cats.map((c) => <Chip key={c.id} t={t} accent="home" on={picked.includes(c.id)} label={`${c.icon} ${c.name}`} onPress={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />)}
        </View>
        <Field t={t} label="Years of experience" value={years} onChangeText={(v) => setYears(v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" />
        <Text style={{ color: t.text, fontWeight: "600" }}>ID proof you will upload</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {homeProIdTypes.map((x) => <Chip key={x} t={t} accent="home" on={idType === x} label={homeProIdTypeLabel[x]} onPress={() => setIdType(x)} />)}
        </View>
        {idType === "aadhaar_masked" && <Text style={{ color: t.muted, fontSize: 13 }}>Upload a masked Aadhaar (only the last 4 digits visible). Download it free from myaadhaar.uidai.gov.in.</Text>}
        {error && <ErrorBanner t={t} message={error} />}
      </ScrollView>
      <StickyFooter t={t}>
        <Button t={t} title="Save and continue" loading={busy} disabled={picked.length === 0 || name.trim().length < 2 || !idType} onPress={async () => {
          setError(null);
          setBusy(true);
          const body = { name: name.trim(), categoryIds: picked, locality: locality.trim() || undefined, experienceYears: years ? Number(years) : undefined, idType: idType || undefined };
          try {
            onSaved(pro ? (await api.home.proUpdate(body)).pro : (await api.home.proApply({ ...body, cityId: "durgapur" })).pro);
          } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(false); }
        }} />
      </StickyFooter>
    </View>
  );
}

function Documents({ t, pro, onChange, onNext }: { t: Theme; pro: HomePro; onChange: (p: HomePro) => void; onNext: () => void }) {
  const [busy, setBusy] = useState<HomeProDocKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const have = new Set(pro.documents.map((d) => d.kind));
  const ready = homeProRequiredDocs.every((k) => have.has(k));
  const kinds = (["id_front", "id_back", "selfie", "certificate"] as HomeProDocKind[]).filter((k) => k !== "id_back" || pro.idType !== "pan");

  async function pick(kind: HomeProDocKind) {
    setError(null);
    const camera = kind === "selfie";
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(camera ? "Allow the camera to take your selfie." : "Allow access to your photos to upload your ID.");
    // Phone photos are big; quality 0.6 brings them to a few hundred KB so uploads work on mobile data.
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, base64: true, cameraType: ImagePicker.CameraType.front };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = r.canceled ? null : r.assets[0];
    if (!asset?.base64) return;
    if (asset.base64.length * 0.75 > HOME_DOC_RULES.maxBytes) return setError("That photo is too large. Try again with a lower camera resolution.");
    setBusy(kind);
    try {
      onChange((await api.home.proUploadDoc(kind, asset.mimeType === "image/png" ? "image/png" : "image/jpeg", asset.base64)).pro);
      haptic.success();
    } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.surface2 }}>
          <Ionicons name="lock-closed" size={18} color={t.muted} />
          <Text style={{ color: t.muted, flex: 1, fontSize: 13 }}>Take clear photos in good light. Only the ZARVA team can see these files; they are stored encrypted.</Text>
        </View>
        {kinds.map((kind) => {
          const done = have.has(kind);
          return (
            <Card key={kind} t={t} onPress={busy ? undefined : () => void pick(kind)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: done ? (t.dark ? "#14352A" : "#E2F7EE") : t.surface2 }}>
                <Ionicons name={done ? "checkmark-circle" : kind === "selfie" ? "camera" : "id-card"} size={24} color={done ? t.success : t.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{homeProDocLabel[kind]}</Text>
                <Text style={{ color: done ? t.success : t.muted, fontSize: 13 }}>
                  {busy === kind ? "Uploading…" : done ? "Uploaded · tap to replace" : homeProRequiredDocs.includes(kind) ? "Required" : "Optional"}
                </Text>
              </View>
              <Text style={{ color: t.primary, fontWeight: "800" }}>{done ? "Replace" : kind === "selfie" ? "Take photo" : "Upload"}</Text>
            </Card>
          );
        })}
        {error && <ErrorBanner t={t} message={error} />}
      </ScrollView>
      <StickyFooter t={t}>
        <Button t={t} title={ready ? "Continue" : "Upload the required photos"} disabled={!ready || busy !== null} onPress={onNext} />
      </StickyFooter>
    </View>
  );
}

function Review({ t, pro, cats, onChange, go }: { t: Theme; pro: HomePro; cats: HomeCategory[]; onChange: (p: HomePro) => void; go: (s: Step) => void }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Group t={t}>
          <ListRow t={t} icon="person-outline" title="Name" subtitle={pro.name} onPress={() => go("details")} />
          <ListRow t={t} icon="construct-outline" title="Work" subtitle={pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", ")} onPress={() => go("details")} />
          <ListRow t={t} icon="id-card-outline" title="Documents" subtitle={pro.documents.map((d) => homeProDocLabel[d.kind]).join(", ") || "None"} onPress={() => go("documents")} />
          <ListRow t={t} icon="wallet-outline" title="Payout" subtitle={pro.payout.upi ?? pro.payout.bankAccountMasked ?? "Not added"} onPress={() => go("payout")} last />
        </Group>
        {pro.missing.length > 0 && <ErrorBanner t={t} message={`Still needed: ${pro.missing.join(", ")}`} />}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => { haptic.tap(); setAgree(!agree); }}
          style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: agree ? t.primary : t.border, backgroundColor: t.surface }}>
          <Ionicons name={agree ? "checkbox" : "square-outline"} size={24} color={agree ? t.primary : t.muted} />
          <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>The documents are mine and the details are true. I agree to ZARVA&apos;s partner terms: a commission on the job price (20% at launch), and cash I collect is settled with ZARVA.</Text>
        </Pressable>
        {error && <ErrorBanner t={t} message={error} />}
      </ScrollView>
      <StickyFooter t={t}>
        <Button t={t} variant="home" title="Submit for review" loading={busy} disabled={!agree || pro.missing.length > 0} onPress={async () => {
          setError(null);
          setBusy(true);
          try { onChange((await api.home.proSubmit()).pro); haptic.success(); } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(false); }
        }} />
      </StickyFooter>
    </View>
  );
}
