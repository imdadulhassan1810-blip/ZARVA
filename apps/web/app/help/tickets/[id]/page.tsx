"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SupportTicket } from "@zarva/core";
import { api, isSignedIn } from "../../../../lib/api";
import { TicketChip, TicketThread } from "../../../../components/Support";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<SupportTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.support.ticket(id).then((r) => setT(r.ticket)), [id]);

  useEffect(() => {
    if (!isSignedIn()) return router.replace(`/login?next=/help/tickets/${id}`);
    setIsNew(new URLSearchParams(window.location.search).has("new"));
    load().catch((e: Error) => setError(e.message));
    // Light polling so a reply from the team shows up without a refresh.
    const timer = setInterval(() => void load().catch(() => {}), 30_000);
    return () => clearInterval(timer);
  }, [id, load, router]);

  if (!t) return <p className="muted">{error ?? "Loading…"}</p>;
  return (
    <div style={{ maxWidth: 680, margin: "0 auto 64px" }}>
      {isNew && <div className="banner-ok">Ticket {t.code} sent. We'll reply here.</div>}
      <h1 style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{t.subject} <TicketChip t={t} /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t.code} · {t.topicLabel}
        {t.referenceLabel && t.module === "home" && t.referenceId && <> · <Link className="link" href={`/home-services/bookings/${t.referenceId}`}>{t.referenceLabel}</Link></>}
      </p>
      <TicketThread
        t={t} viewer="customer" busy={busy}
        onReply={async (m) => { setBusy(true); try { setT((await api.support.reply(t.id, m)).ticket); } finally { setBusy(false); } }}
        onResolve={async () => { setBusy(true); try { setT((await api.support.resolve(t.id)).ticket); } finally { setBusy(false); } }}
      />
      <p style={{ marginTop: 24 }}><Link href="/help" className="muted">← Help &amp; support</Link></p>
    </div>
  );
}
