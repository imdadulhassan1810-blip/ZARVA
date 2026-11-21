import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { verticals } from "@zarva/brand";
import {
  formatPhone, formatRupees, HOME_DOC_RULES, homeLedgerLabel, homeProDocLabel, homeProIdTypeLabel, homeProIdTypes, homeProRequiredDocs,
  type HomeBooking, type HomeCategory, type HomeEarnings, type HomePro, type HomeProDocKind, type HomeProIdType,
} from "@zarva/core";
import { CodeForm } from "../CodeForm";
import { partnerApi as api, loadTokens } from "../api";
import type { Theme } from "../theme";
import { Button, Field, Loading } from "../ui";

/**
 * ZARVA Partner: the service professional's app. Its own sign-in (mobile number), its own screens
 * (Jobs, Earnings, Profile) and nothing from the customer app. One phone number can also have a
 * customer account, but that lives in the ZARVA app, never here.
 */
export function PartnerApp({ t, onSwitchApp }: { t: Theme; onSwitchApp?: () => void }) {
  const [state, setState] = useState<"loading" | "login" | "in">("loading");
  useEffect(() => { loadTokens("partner").then((ok) => setState(ok ? "in" : "login")); }, []);
  if (state === "loading") return <Loading />;
  if (state === "login") return <PartnerLogin t={t} onDone={() => setState("in")} onSwitchApp={onSwitchApp} />;
  return <PartnerMain t={t} onSignedOut={() => setState("login")} />;
}

function Header({ t, title }: { t: Theme; title?: string }) {
  const src = t.dark ? require("../../assets/lockup-dark.png") : require("../../assets/lockup-light.png");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image source={src} style={{ width: 120, height: 34 }} resizeMode="contain" accessibilityLabel="ZARVA" />
      <View style={{ backgroundColor: verticals.home.flat, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ color: "#2a1a00", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>PARTNER</Text>
      </View>
      {title && <Text style={{ color: t.muted, marginLeft: "auto" }}>{title}</Text>}
    </View>
  );
}

function PartnerLogin({ t, onDone, onSwitchApp }: { t: Theme; onDone: () => void; onSwitchApp?: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Header t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize["2xl"], fontWeight: "700", marginTop: 24 }}>Earn with ZARVA</Text>
      <Text style={{ color: t.muted }}>Sign in or sign up with your mobile number to get jobs near you, see your earnings and get paid every week.</Text>
      <CodeForm t={t} kind="phone" onSend={(p) => api.requestOtp(p)} onVerify={async (p, c) => { await api.verifyOtp(p, c); onDone(); }} />
      {onSwitchApp && <Button t={t} ghost title="Development: open the customer app instead" onPress={onSwitchApp} />}
    </ScrollView>
  );
}

type Tab = "jobs" | "earnings" | "profile";

function PartnerMain({ t, onSignedOut }: { t: Theme; onSignedOut: () => void }) {
  const [pro, setPro] = useState<HomePro | null | undefined>(undefined);
  const [cats, setCats] = useState<HomeCategory[]>([]);
  const [tab, setTab] = useState<Tab>("jobs");

  const signOut = useCallback(async () => { await api.logout(); onSignedOut(); }, [onSignedOut]);

  useEffect(() => {
    api.home.catalog("durgapur").then((r) => setCats(r.categories)).catch(() => {});
    api.home.proMe().then((r) => setPro(r.pro)).catch(() => void signOut());
  }, [signOut]);

  if (pro === undefined) return <Loading />;
  if (pro === null || pro.status === "draft" || pro.status === "rejected") {
    return <Onboarding t={t} pro={pro} cats={cats} onChange={setPro} onSignOut={signOut} />;
  }
  if (pro.status === "pending" || pro.status === "suspended") {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Header t={t} />
        <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "700", marginTop: 16 }}>
          {pro.status === "pending" ? `Thanks, ${pro.name.split(" ")[0]}` : `Hi ${pro.name.split(" ")[0]}`}
        </Text>
        <Card t={t}>
          <Text style={{ color: t.text }}>
            {pro.status === "pending"
              ? "We are checking your documents. This usually takes up to 2 working days. You will get an SMS when you are approved, and then jobs appear here."
              : "Your profile is suspended. Please call ZARVA partner support."}
          </Text>
        </Card>
        <Button t={t} ghost title="Check again" onPress={() => api.home.proMe().then((r) => setPro(r.pro)).catch(() => {})} />
        <Button t={t} ghost title="Sign out" onPress={signOut} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "jobs" && <Jobs t={t} pro={pro} />}
        {tab === "earnings" && <Earnings t={t} />}
        {tab === "profile" && <Profile t={t} pro={pro} cats={cats} onPro={setPro} onSignOut={signOut} />}
      </View>
      {/* The partner app's own menu. Nothing from the customer app. */}
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.border, backgroundColor: t.surface, paddingVertical: 6 }}>
        {(["jobs", "earnings", "profile"] as Tab[]).map((x) => (
          <Pressable key={x} accessibilityRole="tab" accessibilityState={{ selected: tab === x }} onPress={() => setTab(x)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10, backgroundColor: tab === x ? t.bg : "transparent" }}>
            <Text style={{ fontSize: 20 }}>{x === "jobs" ? "🧰" : x === "earnings" ? "₹" : "👤"}</Text>
            <Text style={{ color: tab === x ? t.text : t.muted, fontWeight: "600", fontSize: 13 }}>{x === "jobs" ? "Jobs" : x === "earnings" ? "Earnings" : "Profile"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Card({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: t.radius.lg, padding: 14, gap: 8, backgroundColor: t.surface }}>{children}</View>;
}

const when = (b: HomeBooking) =>
  new Date(b.slotStart).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const items = (b: HomeBooking) => b.items.map((i) => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(", ");

function Jobs({ t, pro }: { t: Theme; pro: HomePro }) {
  const [jobs, setJobs] = useState<{ available: HomeBooking[]; mine: HomeBooking[] }>({ available: [], mine: [] });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.home.proJobs().then(setJobs).catch((e: Error) => setError(e.message)), []);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const next = (b: HomeBooking) => {
    if (b.status === "assigned") return <Button t={t} title="I'm on the way" disabled={busy} onPress={() => run(() => api.home.proStatus(b.id, "on_the_way"))} />;
    if (b.status === "on_the_way") return (
      <>
        <Field t={t} label="Customer's 4-digit code" keyboardType="number-pad" maxLength={4} value={codes[b.id] ?? ""} onChangeText={(v) => setCodes({ ...codes, [b.id]: v.replace(/\D/g, "") })} />
        <Button t={t} title="Start job" disabled={busy || (codes[b.id] ?? "").length !== 4} onPress={() => run(() => api.home.proStatus(b.id, "in_progress", codes[b.id]))} />
      </>
    );
    if (b.status === "in_progress") {
      const cash = b.payMode === "after_service";
      return (
        <Button t={t} disabled={busy} title={cash ? `Collected ${formatRupees(b.totalPaise)} · Complete` : "Mark complete"} onPress={() => {
          if (!cash) return void run(() => api.home.proStatus(b.id, "completed"));
          Alert.alert("Cash collected?", `Did you collect ${formatRupees(b.totalPaise)} from the customer?`, [
            { text: "Not yet", style: "cancel" },
            { text: "Yes, complete", onPress: () => void run(() => api.home.proStatus(b.id, "completed")) },
          ]);
        }} />
      );
    }
    return null;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
      <Header t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "700", marginTop: 8 }}>Hi {pro.name.split(" ")[0]}</Text>
      <Text style={{ color: t.muted }}>{pro.locality ?? "Durgapur"} · {pro.jobsDone} jobs done</Text>
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Text style={{ color: t.text, fontWeight: "700", fontSize: t.fontSize.lg, marginTop: 8 }}>Your jobs</Text>
      {jobs.mine.length === 0 && <Text style={{ color: t.muted }}>No jobs yet. Accept one below.</Text>}
      {jobs.mine.map((b) => (
        <Card key={b.id} t={t}>
          <Text style={{ color: t.text, fontWeight: "700" }}>{when(b)}</Text>
          <Text style={{ color: t.text }}>{items(b)}</Text>
          <Text style={{ color: t.text }}>{b.address.name} · {formatPhone(b.address.phone)}</Text>
          <Text style={{ color: t.muted }}>{[b.address.line1, b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</Text>
          {b.customerNote ? <Text style={{ color: t.text }}>Note: {b.customerNote}</Text> : null}
          <Text style={{ color: t.muted }}>{b.payMode === "after_service" ? `Collect ${formatRupees(b.totalPaise)}` : "Paid online, collect nothing"}</Text>
          {next(b)}
        </Card>
      ))}
      <Text style={{ color: t.text, fontWeight: "700", fontSize: t.fontSize.lg, marginTop: 8 }}>New jobs near you</Text>
      {jobs.available.length === 0 && <Text style={{ color: t.muted }}>No open jobs right now. Pull down to refresh.</Text>}
      {jobs.available.map((b) => (
        <Card key={b.id} t={t}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.text, fontWeight: "700" }}>{when(b)}</Text>
            <Text style={{ color: t.text, fontWeight: "700" }}>{formatRupees(b.totalPaise)}</Text>
          </View>
          <Text style={{ color: t.text }}>{items(b)}</Text>
          <Text style={{ color: t.muted }}>{[b.address.line2, b.address.landmark, b.address.pincode].filter(Boolean).join(", ")}</Text>
          <Button t={t} title="Accept job" disabled={busy} onPress={() => run(() => api.home.proAccept(b.id))} />
        </Card>
      ))}
    </ScrollView>
  );
}

function Earnings({ t }: { t: Theme }) {
  const [e, setE] = useState<HomeEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.home.proEarnings().then(setE).catch((x: Error) => setError(x.message)); }, []);
  if (error) return <Text style={{ color: t.danger, padding: 16 }}>{error}</Text>;
  if (!e) return <Loading />;
  const owes = e.balancePaise < 0;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Header t={t} title="Earnings" />
      <Card t={t}>
        <Text style={{ color: t.muted }}>{owes ? "You owe ZARVA (cash collected)" : "ZARVA owes you"}</Text>
        <Text style={{ color: t.text, fontSize: 32, fontWeight: "800" }}>{formatRupees(Math.abs(e.balancePaise))}</Text>
        <Text style={{ color: t.muted }}>Last 7 days: {formatRupees(e.weekPaise)} from {e.jobsThisWeek} job{e.jobsThisWeek === 1 ? "" : "s"}</Text>
      </Card>
      <Text style={{ color: t.text, fontWeight: "700", fontSize: t.fontSize.lg }}>Payouts</Text>
      {e.payouts.length === 0 && <Text style={{ color: t.muted }}>No payouts yet. ZARVA pays your balance every week.</Text>}
      {e.payouts.map((p) => (
        <Card key={p.id} t={t}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.text, fontWeight: "700" }}>{formatRupees(p.amountPaise)}</Text>
            <Text style={{ color: t.muted }}>{{ processing: "Sending", manual: "To pay", paid: "Paid", failed: "Failed" }[p.status]}</Text>
          </View>
          <Text style={{ color: t.muted }}>{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {p.destination}{p.utr ? ` · Ref ${p.utr}` : ""}</Text>
        </Card>
      ))}
      <Text style={{ color: t.text, fontWeight: "700", fontSize: t.fontSize.lg }}>History</Text>
      {e.entries.length === 0 && <Text style={{ color: t.muted }}>Nothing yet. Earnings appear here when you complete a job.</Text>}
      {e.entries.map((x) => (
        <View key={x.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderColor: t.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text }}>{homeLedgerLabel[x.kind]}{x.bookingCode ? ` · ${x.bookingCode}` : ""}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{new Date(x.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
          </View>
          <Text style={{ color: x.amountPaise < 0 ? t.danger : t.text, fontWeight: "700" }}>{x.amountPaise > 0 ? "+" : x.amountPaise < 0 ? "−" : ""}{formatRupees(Math.abs(x.amountPaise))}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Profile({ t, pro, cats, onPro, onSignOut }: { t: Theme; pro: HomePro; cats: HomeCategory[]; onPro: (p: HomePro) => void; onSignOut: () => void }) {
  const [edit, setEdit] = useState(false);
  const row = (label: string, value: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: t.muted }}>{label}</Text><Text style={{ color: t.text, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Header t={t} title="Profile" />
      <Card t={t}>
        {row("Name", pro.name)}
        {row("Mobile", formatPhone(pro.phone))}
        {row("Work", pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "-")}
        {row("Area", pro.locality ?? "Durgapur")}
        {row("Jobs done", String(pro.jobsDone))}
      </Card>
      <Text style={{ color: t.text, fontWeight: "700", fontSize: t.fontSize.lg }}>Payout account</Text>
      <Card t={t}>
        {row("Paid to", pro.payout.upi ?? pro.payout.bankAccountMasked ?? "not set")}
        {edit ? <PayoutForm t={t} pro={pro} submitLabel="Save payout account" onSaved={(p) => { onPro(p); setEdit(false); }} /> : <Button t={t} ghost title="Change" onPress={() => setEdit(true)} />}
      </Card>
      <Text style={{ color: t.muted }}>To change your work or area, call ZARVA partner support.</Text>
      <Button t={t} ghost title="Sign out" onPress={onSignOut} />
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
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["upi", "bank"] as const).map((m) => <View key={m} style={{ flex: 1 }}><Button t={t} ghost={mode !== m} title={m === "upi" ? "UPI" : "Bank account"} onPress={() => setMode(m)} /></View>)}
      </View>
      <Field t={t} label="Account holder name" value={accountName} onChangeText={setAccountName} />
      {mode === "upi"
        ? <Field t={t} label="UPI ID" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="yourname@okaxis" />
        : <>
          <Field t={t} label={`Account number${pro.payout.bankAccountMasked ? ` (now ${pro.payout.bankAccountMasked})` : ""}`} value={bank} onChangeText={(v) => setBank(v.replace(/\D/g, ""))} keyboardType="number-pad" />
          <Field t={t} label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="SBIN0001234" />
        </>}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button t={t} title={busy ? "Saving…" : submitLabel} disabled={busy} onPress={async () => {
        setError(null);
        setBusy(true);
        try {
          const body = mode === "upi" ? { accountName: accountName.trim(), upi: upi.trim() } : { accountName: accountName.trim(), bankAccount: bank, ifsc: ifsc.trim() };
          onSaved((await api.home.proSetPayout(body)).pro);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }} />
    </View>
  );
}

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Header t={t} />
      <Text style={{ color: t.text, fontSize: t.fontSize.xl, fontWeight: "700", marginTop: 8 }}>Become a ZARVA partner</Text>
      <Text style={{ color: t.muted }}>Takes about 5 minutes. Your progress is saved after every step.</Text>
      {pro?.status === "rejected" && (
        <Card t={t}><Text style={{ color: t.text }}><Text style={{ fontWeight: "700" }}>We need a fix before we can approve you: </Text>{pro.rejectionReason}</Text></Card>
      )}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {STEPS.map((s, i) => (
          <View key={s.id} style={{ flex: 1, gap: 4 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= idx ? verticals.home.flat : t.border }} />
            <Text style={{ color: i === idx ? t.text : t.muted, fontSize: 12, fontWeight: i === idx ? "700" : "400" }}>{s.label}</Text>
          </View>
        ))}
      </View>
      {step === "details" && <Details t={t} pro={pro} cats={cats} onSaved={(p) => { onChange(p); setStep("documents"); }} />}
      {step === "documents" && pro && <Documents t={t} pro={pro} onChange={onChange} onNext={() => setStep("payout")} onBack={() => setStep("details")} />}
      {step === "payout" && pro && <Card t={t}><PayoutForm t={t} pro={pro} onSaved={(p) => { onChange(p); setStep("review"); }} /></Card>}
      {step === "review" && pro && <Review t={t} pro={pro} cats={cats} onChange={onChange} go={setStep} />}
      <Button t={t} ghost title="Sign out" onPress={onSignOut} />
    </ScrollView>
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
  const chip = (on: boolean, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: on ? verticals.home.flat : t.border, backgroundColor: on ? verticals.home.flat : t.surface }}>
      <Text style={{ color: on ? "#2a1a00" : t.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <Card t={t}>
      <Field t={t} label="Full name (as on your ID)" value={name} onChangeText={setName} autoComplete="name" />
      <Field t={t} label="Your area in Durgapur" value={locality} onChangeText={setLocality} placeholder="e.g. Benachity, City Centre" />
      <Text style={{ color: t.text, fontWeight: "500" }}>What work do you do?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {cats.map((c) => chip(picked.includes(c.id), `${c.icon} ${c.name}`, () => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])))}
      </View>
      <Field t={t} label="Years of experience" value={years} onChangeText={(v) => setYears(v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" />
      <Text style={{ color: t.text, fontWeight: "500" }}>ID proof you will upload</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {homeProIdTypes.map((x) => chip(idType === x, homeProIdTypeLabel[x], () => setIdType(x)))}
      </View>
      {idType === "aadhaar_masked" && <Text style={{ color: t.muted }}>Upload a masked Aadhaar (only the last 4 digits visible). Download it free from myaadhaar.uidai.gov.in.</Text>}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button t={t} title={busy ? "Saving…" : "Save and continue"} disabled={busy || picked.length === 0 || name.trim().length < 2 || !idType} onPress={async () => {
        setError(null);
        setBusy(true);
        const body = { name: name.trim(), categoryIds: picked, locality: locality.trim() || undefined, experienceYears: years ? Number(years) : undefined, idType: idType || undefined };
        try {
          onSaved(pro ? (await api.home.proUpdate(body)).pro : (await api.home.proApply({ ...body, cityId: "durgapur" })).pro);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }} />
    </Card>
  );
}

function Documents({ t, pro, onChange, onNext, onBack }: { t: Theme; pro: HomePro; onChange: (p: HomePro) => void; onNext: () => void; onBack: () => void }) {
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
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <Card t={t}>
      <Text style={{ color: t.muted }}>Take clear photos in good light. Only the ZARVA team can see these files; they are stored encrypted.</Text>
      {kinds.map((kind) => (
        <View key={kind} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 24 }}>{have.has(kind) ? "✅" : kind === "selfie" ? "🙂" : "🪪"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "600" }}>{homeProDocLabel[kind]}{homeProRequiredDocs.includes(kind) ? " · required" : ""}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{busy === kind ? "Uploading…" : have.has(kind) ? "Uploaded" : "Photo"}</Text>
          </View>
          <Button t={t} ghost title={have.has(kind) ? "Replace" : kind === "selfie" ? "Take photo" : "Upload"} disabled={busy !== null} onPress={() => void pick(kind)} />
        </View>
      ))}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Button t={t} ghost title="Back" onPress={onBack} /></View>
        <View style={{ flex: 1 }}><Button t={t} title="Continue" disabled={!ready || busy !== null} onPress={onNext} /></View>
      </View>
    </Card>
  );
}

function Review({ t, pro, cats, onChange, go }: { t: Theme; pro: HomePro; cats: HomeCategory[]; onChange: (p: HomePro) => void; go: (s: Step) => void }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = (label: string, value: string, s: Step) => (
    <Pressable onPress={() => go(s)} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 4 }}>
      <Text style={{ color: t.text, flex: 1 }}><Text style={{ color: t.muted }}>{label}: </Text>{value}</Text>
      <Text style={{ color: t.primary, fontWeight: "600" }}>Edit</Text>
    </Pressable>
  );
  return (
    <Card t={t}>
      {row("Name", pro.name, "details")}
      {row("Work", pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", "), "details")}
      {row("Documents", pro.documents.map((d) => homeProDocLabel[d.kind]).join(", ") || "None", "documents")}
      {row("Payout", pro.payout.upi ?? pro.payout.bankAccountMasked ?? "Not added", "payout")}
      {pro.missing.length > 0 && <Text style={{ color: t.danger }}>Still needed: {pro.missing.join(", ")}</Text>}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
        <Text style={{ fontSize: 20 }}>{agree ? "☑️" : "⬜"}</Text>
        <Text style={{ color: t.text, flex: 1 }}>The documents are mine and the details are true. I agree to ZARVA&apos;s partner terms: a commission on the job price (20% at launch), and cash I collect is settled with ZARVA.</Text>
      </Pressable>
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button t={t} title={busy ? "Submitting…" : "Submit for review"} disabled={busy || !agree || pro.missing.length > 0} onPress={async () => {
        setError(null);
        setBusy(true);
        try { onChange((await api.home.proSubmit()).pro); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }} />
    </Card>
  );
}
