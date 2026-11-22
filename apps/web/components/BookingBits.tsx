import { formatDay, formatRupees, formatSlot, homeBillLines, istDate, type HomeBooking, type HomeBookingStatus, type HomePriceBreakdown } from "@zarva/core";

const tone: Record<HomeBookingStatus, string> = {
  pending_payment: "warn", confirmed: "info", assigned: "info", on_the_way: "info", in_progress: "info", completed: "ok", cancelled: "bad",
};

export function StatusChip({ b }: { b: Pick<HomeBooking, "status" | "statusLabel"> }) {
  return <span className={`chip chip-${tone[b.status]}`}>{b.statusLabel}</span>;
}

export function when(b: Pick<HomeBooking, "slotStart">): string {
  return `${formatDay(istDate(new Date(b.slotStart)), istDate(new Date()))}, ${formatSlot(b.slotStart)}`;
}

export function itemsLine(b: HomeBooking): string {
  return b.items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name)).join(", ");
}

export function BookingSummary({ b }: { b: HomeBooking }) {
  return (
    <div className="card stack">
      {b.items.map((i) => (
        <div key={i.serviceId} className="sum-row"><span>{i.name} × {i.qty}</span><span>{formatRupees(i.unitPricePaise * i.qty)}</span></div>
      ))}
      <ChargeLines t={b} />
      <div className="muted" style={{ fontSize: 14 }}>
        {b.payMode === "online" ? (b.paid ? "Paid online" : "Not paid yet") : b.paid ? "Paid to professional" : "Pay the professional after the job"}
        {b.refundedPaise > 0 && ` · ${formatRupees(b.refundedPaise)} refunded`}
      </div>
    </div>
  );
}

/**
 * Below the item list: service price subtotal, service and platform charges, GST, total.
 * The same lines (homeBillLines) are on the booking page and the invoice, and they add up to the total.
 */
export function ChargeLines({ t }: { t: { subtotalPaise: number; feePaise: number; totalPaise: number; pricing?: HomePriceBreakdown | null } }) {
  const lines = homeBillLines(t).filter((l) => l.key !== "items");
  return (
    <>
      {lines.map((l) => (
        <div key={l.key} className={`sum-row${l.key === "base" ? "" : " muted"}`}><span>{l.label}</span><span>{formatRupees(l.paise)}</span></div>
      ))}
      <div className="sum-row total"><span>Total</span><span>{formatRupees(t.totalPaise)}</span></div>
    </>
  );
}
