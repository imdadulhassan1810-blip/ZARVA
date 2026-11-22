"use client";
import Link from "next/link";
import { useState } from "react";
import {
  feedbackKindLabel, feedbackKinds, SUPPORT_RULES, supportTopicLabel, supportTopics,
  type FeedbackKind, type SupportStatus, type SupportTicket, type SupportTopic,
} from "@zarva/core";
import { api } from "../lib/api";

const tone: Record<SupportStatus, string> = { open: "info", waiting_customer: "warn", resolved: "ok" };

export function TicketChip({ t }: { t: Pick<SupportTicket, "status" | "statusLabel"> }) {
  return <span className={`chip chip-${tone[t.status]}`}>{t.statusLabel}</span>;
}

export function TicketRow({ t, href = `/help/tickets/${t.id}` }: { t: SupportTicket; href?: string }) {
  const last = t.messages[t.messages.length - 1];
  return (
    <Link href={href} className="card ticket-row">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>{t.subject}</strong>
        <TicketChip t={t} />
      </div>
      <span className="muted" style={{ fontSize: 13 }}>{t.code} · {t.referenceLabel ?? t.topicLabel} · {fmt(t.updatedAt)}</span>
      {last && <span className="ticket-last">{last.from === "zarva" ? "ZARVA: " : ""}{last.body}</span>}
    </Link>
  );
}

export function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/** The conversation, newest at the bottom, with a reply box. Used by customers and the admin app. */
export function TicketThread({ t, viewer, onReply, onResolve, busy }: {
  t: SupportTicket;
  viewer: "customer" | "admin";
  onReply: (message: string, resolve: boolean) => Promise<void>;
  onResolve?: () => Promise<void>;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function send(resolve: boolean) {
    setError(null);
    try {
      await onReply(text.trim(), resolve);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="stack">
      <ol className="thread">
        {t.messages.map((m) => {
          const mine = (viewer === "customer") === (m.from === "customer");
          return (
            <li key={m.id} className={`bubble ${mine ? "bubble-me" : "bubble-them"} ${m.from === "zarva" ? "bubble-zarva" : ""}`}>
              <span className="bubble-who">{m.authorName}</span>
              <span className="bubble-body">{m.body}</span>
              <span className="bubble-at">{fmt(m.at)}</span>
            </li>
          );
        })}
      </ol>
      <label>
        {t.status === "resolved" && viewer === "customer" ? "Still need help? Reply to reopen this ticket" : "Your reply"}
        <textarea rows={3} maxLength={SUPPORT_RULES.maxMessage} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => send(false)}>Send</button>
        {viewer === "admin" && <button className="btn btn-ghost" disabled={busy || !text.trim()} onClick={() => send(true)}>Send and mark resolved</button>}
        {viewer === "customer" && t.status !== "resolved" && onResolve && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => void onResolve()}>My problem is solved</button>
        )}
      </div>
    </div>
  );
}

export function TicketForm({ bookingId, bookingLabel, onCreated }: { bookingId?: string; bookingLabel?: string; onCreated: (t: SupportTicket) => void }) {
  const [topic, setTopic] = useState<SupportTopic>(bookingId ? "booking_issue" : "app_problem");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const topics = bookingId ? supportTopics : supportTopics.filter((x) => x !== "pro_behaviour");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.support.create({ topic, subject, message, ...(bookingId ? { module: "home" as const, referenceId: bookingId } : {}) });
      onCreated(r.ticket);
    } catch (err) {
      const x = err as Error & { code?: string };
      setError(x.message);
      if (x.code === "ticket_exists") {
        const mine = await api.support.tickets({ module: "home", referenceId: bookingId! }).catch(() => null);
        const open = mine?.tickets.find((t) => t.status !== "resolved");
        if (open) setExisting(open.id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      {bookingLabel && <div className="ref-chip">About: {bookingLabel}</div>}
      <label>
        What is it about?
        <select value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
          {topics.map((x) => <option key={x} value={x}>{supportTopicLabel[x]}</option>)}
        </select>
      </label>
      <label>
        Subject
        <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Refund not received" required minLength={4} />
      </label>
      <label>
        Tell us what happened
        <textarea rows={5} value={message} maxLength={SUPPORT_RULES.maxMessage} onChange={(e) => setMessage(e.target.value)} required minLength={10}
          placeholder="Include what you expected and what happened instead" />
      </label>
      {error && <p className="error" role="alert">{error} {existing && <Link className="link" href={`/help/tickets/${existing}`}>Open it</Link>}</p>}
      <button className="btn" disabled={busy}>Send to ZARVA</button>
      <span className="muted" style={{ fontSize: 13 }}>For safety emergencies, call 112 first.</span>
    </form>
  );
}

export function FeedbackForm({ onSent }: { onSent: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.support.feedback({ kind, rating: rating || undefined, message, platform: "web" });
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <fieldset className="plain">
        <legend>How do you like ZARVA so far? (optional)</legend>
        <div className="star-input" role="radiogroup" aria-label="Overall rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={rating >= n ? "on" : ""} onClick={() => setRating(n === rating ? 0 : n)}>★</button>
          ))}
        </div>
      </fieldset>
      <label>
        Type
        <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
          {feedbackKinds.map((k) => <option key={k} value={k}>{feedbackKindLabel[k]}</option>)}
        </select>
      </label>
      <label>
        Your feedback
        <textarea rows={5} value={message} maxLength={SUPPORT_RULES.maxMessage} onChange={(e) => setMessage(e.target.value)} required minLength={5}
          placeholder="What should we add, fix or keep doing?" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>Send feedback</button>
      <span className="muted" style={{ fontSize: 13 }}>Feedback isn't answered one by one. If you need a reply, raise a ticket instead.</span>
    </form>
  );
}
