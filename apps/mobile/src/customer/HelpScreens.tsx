import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  feedbackKindLabel, feedbackKinds, SUPPORT_RULES, supportFaq, supportTopicLabel, supportTopics,
  type FeedbackKind, type HomeRatingSummary, type HomeReview, type SupportTicket, type SupportTopic,
} from "@zarva/core";
import { api } from "../api";
import { RatingOverview, ReviewItem, StarPicker, TextArea, ticketColor } from "../care";
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Group, haptic, Ionicons, Pill, SectionTitle } from "../ui";
import { useSession, type CustomerStackParams } from "./CustomerApp";
import type { Nav } from "./HomeScreen";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Help & support: quick answers, the customer's tickets, raise a ticket, send feedback. */
export function HelpScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api.support.tickets().then((r) => setTickets(r.tickets)).catch(() => setTickets([])), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card t={t} onPress={() => nav.navigate("NewTicket", {})} style={{ flex: 1, gap: 6 }}>
          <Ionicons name="chatbubbles" size={26} color={t.primary} />
          <Text style={{ color: t.text, fontWeight: "800" }}>Raise a ticket</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>Booking, payment or app problem</Text>
        </Card>
        <Card t={t} onPress={() => nav.navigate("Feedback")} style={{ flex: 1, gap: 6 }}>
          <Ionicons name="bulb" size={26} color={t.home} />
          <Text style={{ color: t.text, fontWeight: "800" }}>Send feedback</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>Ideas, compliments, complaints</Text>
        </Card>
      </View>

      {tickets && tickets.length > 0 && (
        <>
          <SectionTitle t={t} title="Your tickets" />
          {tickets.map((x) => <TicketCard key={x.id} t={t} x={x} onPress={() => nav.navigate("Ticket", { id: x.id })} />)}
        </>
      )}

      <SectionTitle t={t} title="Common questions" />
      {supportFaq.map((s) => (
        <View key={s.title} style={{ gap: 8 }}>
          <Text style={{ color: t.muted, fontWeight: "700", fontSize: 12, letterSpacing: 0.6 }}>{s.title.toUpperCase()}</Text>
          <Group t={t}>
            {s.items.map((i, idx) => {
              const on = open === i.q;
              return (
                <Pressable key={i.q} accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => { haptic.tap(); setOpen(on ? null : i.q); }}
                  style={{ padding: 16, gap: 8, borderBottomWidth: idx === s.items.length - 1 ? 0 : 1, borderColor: t.border }}>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text style={{ color: t.text, fontWeight: "700", flex: 1 }}>{i.q}</Text>
                    <Ionicons name={on ? "chevron-up" : "chevron-down"} size={18} color={t.muted} />
                  </View>
                  {on && <Text style={{ color: t.muted, lineHeight: 20 }}>{i.a}</Text>}
                </Pressable>
              );
            })}
          </Group>
        </View>
      ))}
    </ScrollView>
  );
}

function TicketCard({ t, x, onPress }: { t: ReturnType<typeof useSession>["t"]; x: SupportTicket; onPress: () => void }) {
  const last = x.messages[x.messages.length - 1];
  return (
    <Card t={t} onPress={onPress} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Pill t={t} label={x.statusLabel} color={ticketColor(t, x.status)} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{x.code}</Text>
      </View>
      <Text style={{ color: t.text, fontWeight: "800" }} numberOfLines={1}>{x.subject}</Text>
      <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{x.referenceLabel ?? x.topicLabel} · {fmt(x.updatedAt)}</Text>
      {last && <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{last.from === "zarva" ? "ZARVA: " : ""}{last.body}</Text>}
    </Card>
  );
}

export function NewTicketScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<CustomerStackParams, "NewTicket">>();
  const [topic, setTopic] = useState<SupportTopic>(params.bookingId ? "booking_issue" : "app_problem");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const topics = params.bookingId ? supportTopics : supportTopics.filter((x) => x !== "pro_behaviour");

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.support.create({ topic, subject, message, ...(params.bookingId ? { module: "home" as const, referenceId: params.bookingId } : {}) });
      haptic.success();
      nav.replace("Ticket", { id: r.ticket.id, justCreated: true });
    } catch (e) {
      haptic.error();
      const x = e as Error & { code?: string };
      setError(x.message);
      if (x.code === "ticket_exists" && params.bookingId) {
        const mine = await api.support.tickets({ module: "home", referenceId: params.bookingId }).catch(() => null);
        setExisting(mine?.tickets.find((y) => y.status !== "resolved")?.id ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {params.label && <Pill t={t} label={`About: ${params.label}`} color={t.primary} icon="receipt-outline" />}
        <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>What is it about?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {topics.map((x) => <Chip key={x} t={t} label={supportTopicLabel[x]} on={topic === x} onPress={() => setTopic(x)} />)}
        </View>
        <Field t={t} label="Subject" value={subject} onChangeText={setSubject} maxLength={120} placeholder="e.g. Refund not received" />
        <TextArea t={t} label="Tell us what happened" value={message} onChange={setMessage} maxLength={SUPPORT_RULES.maxMessage} minHeight={140}
          placeholder="Include what you expected and what happened instead" />
        {error && <ErrorBanner t={t} message={error} />}
        {existing && <Button t={t} variant="outline" title="Open my existing ticket" onPress={() => nav.replace("Ticket", { id: existing })} />}
        <Button t={t} title="Send to ZARVA" icon="send" loading={busy} disabled={subject.trim().length < 4 || message.trim().length < 10} onPress={() => void send()} />
        <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>Our team replies here in the app. For safety emergencies, call 112 first.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function TicketScreen() {
  const { t } = useSession();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<CustomerStackParams, "Ticket">>();
  const [x, setX] = useState<SupportTicket | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const load = useCallback(() => api.support.ticket(params.id).then((r) => { setX(r.ticket); setError(null); }).catch((e: Error) => setError(e.message)), [params.id]);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function act(fn: () => Promise<{ ticket: SupportTicket }>) {
    setBusy(true);
    setError(null);
    try {
      setX((await fn()).ticket);
      setText("");
      haptic.success();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!x) return <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>{error ? <ErrorBanner t={t} message={error} onRetry={() => void load()} /> : null}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll as never} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {params.justCreated && (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: t.dark ? "#14352A" : "#E2F7EE" }}>
            <Ionicons name="checkmark-circle" size={22} color={t.success} />
            <Text style={{ color: t.text, flex: 1 }}>Ticket {x.code} sent. We&apos;ll reply here.</Text>
          </View>
        )}
        <Card t={t} style={{ gap: 6 }}>
          <Pill t={t} label={x.statusLabel} color={ticketColor(t, x.status)} />
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{x.subject}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{x.code} · {x.topicLabel}</Text>
          {x.referenceLabel && x.referenceId && (
            <Pressable accessibilityRole="link" onPress={() => nav.navigate("Booking", { id: x.referenceId! })}>
              <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>{x.referenceLabel} ›</Text>
            </Pressable>
          )}
        </Card>
        {x.messages.map((m) => {
          const mine = m.from === "customer";
          return (
            <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%", gap: 3, padding: 12, borderRadius: 16,
              borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4,
              backgroundColor: mine ? (t.dark ? "#2B2150" : "#EEE9FF") : t.surface, borderWidth: mine ? 0 : 1, borderColor: t.border }}>
              <Text style={{ color: m.from === "zarva" ? t.primary : t.muted, fontWeight: "700", fontSize: 12 }}>{m.authorName}</Text>
              <Text style={{ color: t.text }}>{m.body}</Text>
              <Text style={{ color: t.muted, fontSize: 11, alignSelf: "flex-end" }}>{fmt(m.at)}</Text>
            </View>
          );
        })}
        {error && <ErrorBanner t={t} message={error} />}
        <TextArea t={t} label={x.status === "resolved" ? "Still need help? Reply to reopen" : "Your reply"} value={text} onChange={setText} maxLength={SUPPORT_RULES.maxMessage} minHeight={72} />
        <Button t={t} title="Send" icon="send" loading={busy} disabled={!text.trim()} onPress={() => void act(() => api.support.reply(x.id, text.trim()))} />
        {x.status !== "resolved" && <Button t={t} variant="plain" title="My problem is solved" onPress={() => void act(() => api.support.resolve(x.id))} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function FeedbackScreen() {
  const { t } = useSession();
  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) return <View style={{ flex: 1, backgroundColor: t.bg }}><EmptyState t={t} icon="heart-outline" title="Thank you!" body="The ZARVA team reads all feedback." /></View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>How do you like ZARVA so far? (optional)</Text>
        <StarPicker t={t} value={rating} onChange={(n) => setRating(n === rating ? 0 : n)} size={34} />
        <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>Type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {feedbackKinds.map((k) => <Chip key={k} t={t} label={feedbackKindLabel[k]} on={kind === k} onPress={() => setKind(k)} />)}
        </View>
        <TextArea t={t} label="Your feedback" value={message} onChange={setMessage} maxLength={SUPPORT_RULES.maxMessage} minHeight={140} placeholder="What should we add, fix or keep doing?" />
        {error && <ErrorBanner t={t} message={error} />}
        <Button t={t} title="Send feedback" loading={busy} disabled={message.trim().length < 5} onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.support.feedback({ kind, rating: rating || undefined, message, platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "app" });
            haptic.success();
            setSent(true);
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }} />
        <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>Feedback isn&apos;t answered one by one. Need a reply? Raise a ticket.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Rating summary and latest reviews for one category, under its services. Honest when empty. */
export function CategoryRatings({ slug }: { slug: string }) {
  const { t } = useSession();
  const [summary, setSummary] = useState<HomeRatingSummary | null>(null);
  const [reviews, setReviews] = useState<HomeReview[]>([]);
  useEffect(() => {
    api.home.ratingSummary().then((r) => setSummary(r.categories[slug] ?? { average: null, count: 0, stars: [0, 0, 0, 0, 0] })).catch(() => {});
    api.home.reviews({ category: slug, limit: 5 }).then((r) => setReviews(r.reviews)).catch(() => {});
  }, [slug]);
  if (!summary) return null;
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <SectionTitle t={t} title="Ratings" />
      {summary.count === 0
        ? <Text style={{ color: t.muted }}>No ratings yet. Only customers whose job was completed can rate, so this fills up as people book.</Text>
        : <><RatingOverview t={t} summary={summary} />{reviews.map((r) => <ReviewItem key={r.id} t={t} r={r} />)}</>}
    </View>
  );
}

