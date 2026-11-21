import { formatRupees, homeLedgerLabel, type HomeEarnings, type HomeLedgerEntry, type HomePayout } from "@zarva/core";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function Amount({ paise }: { paise: number }) {
  return <span className={`amt ${paise > 0 ? "amt-plus" : paise < 0 ? "amt-minus" : ""}`}>{paise > 0 ? "+" : paise < 0 ? "−" : ""}{formatRupees(Math.abs(paise))}</span>;
}

export function BalanceCard({ e, who = "you" }: { e: HomeEarnings; who?: "you" | "pro" }) {
  const owes = e.balancePaise < 0;
  return (
    <div className="card balance">
      <div>
        <div className="muted" style={{ fontSize: 14 }}>{owes ? (who === "you" ? "You owe ZARVA (cash collected)" : "Pro owes ZARVA") : who === "you" ? "ZARVA owes you" : "ZARVA owes"}</div>
        <div className="big">{formatRupees(Math.abs(e.balancePaise))}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="muted" style={{ fontSize: 14 }}>Last 7 days</div>
        <div><strong>{formatRupees(e.weekPaise)}</strong> from {e.jobsThisWeek} job{e.jobsThisWeek === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}

export function LedgerList({ entries }: { entries: HomeLedgerEntry[] }) {
  if (entries.length === 0) return <p className="muted">Nothing yet. Earnings appear here when you complete a job.</p>;
  return (
    <div className="card ledger">
      {entries.map((x) => (
        <div key={x.id}>
          <div>
            <div>{homeLedgerLabel[x.kind]}{x.bookingCode ? ` · ${x.bookingCode}` : ""}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {day(x.at)}
              {x.kind === "job_earning" && x.grossPaise != null && ` · job ${formatRupees(x.grossPaise)} − commission ${formatRupees(x.commissionPaise ?? 0)}`}
              {x.note && x.kind !== "job_earning" ? ` · ${x.note}` : ""}
            </div>
          </div>
          <Amount paise={x.amountPaise} />
        </div>
      ))}
    </div>
  );
}

const payoutTone: Record<HomePayout["status"], string> = { processing: "info", manual: "warn", paid: "ok", failed: "bad" };
const payoutLabel: Record<HomePayout["status"], string> = { processing: "Sending", manual: "To pay", paid: "Paid", failed: "Failed" };

export function PayoutChip({ p }: { p: HomePayout }) {
  return <span className={`chip chip-${payoutTone[p.status]}`}>{payoutLabel[p.status]}</span>;
}
