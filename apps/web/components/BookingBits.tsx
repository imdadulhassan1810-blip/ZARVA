import { formatDay, formatRupees, formatSlot, istDate, type HomeBooking, type HomeBookingStatus } from "@zarva/core";

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
      {b.feePaise > 0 && <div className="sum-row muted"><span>Convenience fee</span><span>{formatRupees(b.feePaise)}</span></div>}
      <div className="sum-row total"><span>Total</span><span>{formatRupees(b.totalPaise)}</span></div>
      <div className="muted" style={{ fontSize: 14 }}>
        {b.payMode === "online" ? (b.paid ? "Paid online" : "Not paid yet") : b.paid ? "Paid to professional" : "Pay the professional after the job"}
        {b.refundedPaise > 0 && ` · ${formatRupees(b.refundedPaise)} refunded`}
      </div>
    </div>
  );
}
