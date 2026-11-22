"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supportFaq, type SupportTicket } from "@zarva/core";
import { api, isSignedIn } from "../../lib/api";
import { TicketRow } from "../../components/Support";

/** Help centre: answers first, then the customer's tickets, then ways to reach the team. */
export default function Help() {
  const [signedIn, setSignedIn] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const s = isSignedIn();
    setSignedIn(s);
    if (s) api.support.tickets().then((r) => setTickets(r.tickets)).catch(() => setTickets([]));
  }, []);

  const needle = q.trim().toLowerCase();
  const sections = supportFaq
    .map((s) => ({ ...s, items: s.items.filter((i) => !needle || `${i.q} ${i.a}`.toLowerCase().includes(needle)) }))
    .filter((s) => s.items.length > 0);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto 64px" }}>
      <h1>Help &amp; support</h1>
      <p className="muted" style={{ marginTop: 0 }}>Find a quick answer, or write to the ZARVA team. We reply right here.</p>

      <div className="help-actions">
        <Link href="/help/new" className="help-action">
          <span aria-hidden>💬</span><strong>Raise a ticket</strong><span className="muted">A problem with a booking, payment or the app</span>
        </Link>
        <Link href="/help/feedback" className="help-action">
          <span aria-hidden>💡</span><strong>Send feedback</strong><span className="muted">Ideas, compliments or complaints about ZARVA</span>
        </Link>
      </div>

      {signedIn && tickets && tickets.length > 0 && (
        <>
          <h2>Your tickets</h2>
          <div className="stack">{tickets.map((t) => <TicketRow key={t.id} t={t} />)}</div>
        </>
      )}

      <h2>Common questions</h2>
      <input type="search" placeholder="Search help, e.g. refund" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" style={{ width: "100%", marginBottom: 12 }} />
      {sections.length === 0 && <p className="muted">Nothing matches “{q}”. <Link className="link" href="/help/new">Ask the team</Link> instead.</p>}
      {sections.map((s) => (
        <section key={s.title} className="faq-section">
          <h3>{s.title}</h3>
          {s.items.map((i) => (
            <details key={i.q} className="faq">
              <summary>{i.q}</summary>
              <p>{i.a}</p>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
