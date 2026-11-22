import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  formatBps, formatNotice, formatRupees, homeChangeBlockText, refundSlabLines,
  type HomeBooking, type HomeCancelInfo, type HomePolicy, type HomeSlotDay,
} from "@zarva/core";
import { api } from "../api";
import type { Theme } from "../theme";
import { Button, Card, ErrorBanner, Field, haptic, Ionicons, Sheet } from "../ui";
import { SlotSheet } from "./CheckoutScreen";

const deadline = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Line({ t, label, value, bold, muted }: { t: Theme; label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: muted ? t.muted : t.text, fontWeight: bold ? "800" : "400", flex: 1 }}>{label}</Text>
      <Text style={{ color: muted ? t.muted : t.text, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

/** The rules in plain words, shown on the booking. */
export function RulesCard({ t, policy }: { t: Theme; policy: HomePolicy }) {
  const cutoff = formatNotice(policy.customerCutoffMinutes);
  return (
    <Card t={t} style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: "800" }}>Cancellation and reschedule</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>• Reschedule free, up to {policy.maxReschedules} times, until {cutoff} before your slot.</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>• Cancel until {cutoff} before. Refund of the service price:</Text>
      {refundSlabLines(policy).map((l) => <Text key={l} style={{ color: t.muted, fontSize: 13, paddingLeft: 12 }}>– {l}</Text>)}
      <Text style={{ color: t.muted, fontSize: 13 }}>• GST is refunded in the same share. The convenience fee is not refunded.</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>• Less than {cutoff} before the slot, no changes are possible.</Text>
    </Card>
  );
}

/**
 * Cancel and reschedule for the customer. The buttons stay on screen but are switched off, with the
 * reason, once the rules don't allow a change.
 */
export function BookingChanges({ t, b, policy, onChange }: { t: Theme; b: HomeBooking; policy: HomePolicy; onChange: (b: HomeBooking) => void }) {
  const [info, setInfo] = useState<HomeCancelInfo | null>(b.cancelInfo ?? null);
  const [sheet, setSheet] = useState<"cancel" | "slot" | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<HomeSlotDay[]>([]);
  const [day, setDay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setInfo(b.cancelInfo ?? null), [b]);
  if (!info || !["pending_payment", "confirmed", "assigned"].includes(b.status)) return null;
  const unpaid = b.status === "pending_payment";

  async function openCancel() {
    setError(null);
    setSheet("cancel");
    try { setInfo((await api.home.cancelQuote(b.id)).cancelInfo); } catch (e) { setError((e as Error).message); }
  }
  async function openSlots() {
    setError(null);
    try {
      const r = await api.home.slots(b.cityId, b.categoryId);
      // The current slot can't be picked again.
      setDays(r.days.map((d) => ({ ...d, slots: d.slots.map((s) => (s.start === b.slotStart ? { ...s, available: false } : s)) })));
      const first = r.days.findIndex((d) => d.slots.some((s) => s.available && s.start !== b.slotStart));
      setDay(first < 0 ? 0 : first);
      setSheet("slot");
    } catch (e) { setError((e as Error).message); }
  }
  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.home.cancel(b.id, reason.trim() || undefined, info?.quote?.refundPaise);
      haptic.success();
      setSheet(null);
      onChange(r.booking);
    } catch (e) {
      haptic.error();
      const err = e as Error & { code?: string };
      if (err.code === "quote_changed") setInfo((await api.home.cancelQuote(b.id)).cancelInfo);
      setError(err.message);
    } finally { setBusy(false); }
  }
  async function move(slot: string) {
    setSheet(null);
    setBusy(true);
    setError(null);
    try {
      const r = await api.home.reschedule(b.id, slot);
      haptic.success();
      onChange(r.booking);
    } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(false); }
  }

  const why = (k: HomeCancelInfo["cancelBlock"]) => (k ? homeChangeBlockText[k](policy) : null);
  const q = info.quote;
  return (
    <Card t={t} style={{ gap: 10 }}>
      <Text style={{ color: t.text, fontWeight: "800" }}>Need to change this booking?</Text>
      {!unpaid && (info.canCancel || info.canReschedule) && (
        <Text style={{ color: t.muted, fontSize: 13 }}>Cancel or reschedule until {deadline(info.changeDeadline)}.</Text>
      )}
      {!unpaid && (
        <Button t={t} variant="outline" icon="calendar-outline" disabled={!info.canReschedule || busy}
          title={`Reschedule (free${info.reschedulesLeft > 0 ? `, ${info.reschedulesLeft} left` : ""})`} onPress={() => void openSlots()} />
      )}
      <Button t={t} variant="outline" icon="close-circle-outline" disabled={!info.canCancel || busy} title="Cancel booking" onPress={() => void openCancel()} />
      {!info.canCancel && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Ionicons name="information-circle-outline" size={18} color={t.muted} />
          <Text style={{ color: t.muted, fontSize: 13, flex: 1 }}>{why(info.cancelBlock)}</Text>
        </View>
      )}
      {info.canCancel && !info.canReschedule && !unpaid && <Text style={{ color: t.muted, fontSize: 13 }}>{why(info.rescheduleBlock)}</Text>}
      {error && <ErrorBanner t={t} message={error} />}

      <Sheet t={t} visible={sheet === "cancel"} onClose={() => setSheet(null)} title={`Cancel booking ${b.code}?`}>
        <View style={{ padding: 20, gap: 10 }}>
          {q ? (
            <>
              <Line t={t} label={`Service price (before GST) · ${formatBps(q.refundBps)} back`} value={formatRupees(q.baseRefundPaise)} />
              <Line t={t} label={`GST on it · ${formatBps(q.refundBps)} back`} value={formatRupees(q.gstRefundPaise)} />
              {q.feeKeptPaise > 0 && <Line t={t} label={`Convenience fee ${formatRupees(q.feeKeptPaise)} · not refunded`} value={formatRupees(0)} muted />}
              <View style={{ height: 1, backgroundColor: t.border }} />
              <Line t={t} label="You get back" value={formatRupees(q.refundPaise)} bold />
              <Line t={t} label="Cancellation charge" value={formatRupees(q.chargePaise)} muted />
              <Text style={{ color: t.muted, fontSize: 13 }}>Refunds reach your bank or UPI app in 5-7 working days.</Text>
            </>
          ) : (
            <Text style={{ color: t.muted }}>Nothing was paid, so there is nothing to refund.</Text>
          )}
          <Field t={t} label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={200} placeholder="e.g. Plans changed" />
          {error && <ErrorBanner t={t} message={error} />}
          <Button t={t} variant="danger" loading={busy} disabled={!info.canCancel}
            title={q ? `Cancel and get ${formatRupees(q.refundPaise)} back` : "Yes, cancel booking"} onPress={() => void cancel()} />
          <Button t={t} variant="outline" title="Keep booking" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
      <SlotSheet t={t} visible={sheet === "slot"} days={days} day={day} slot={null} onDay={setDay} onClose={() => setSheet(null)} onPick={(s) => void move(s)} />
    </Card>
  );
}
