"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, isSignedIn } from "../../../lib/api";
import { TicketForm } from "../../../components/Support";

/** Raise a ticket. /help/new?booking=<id> attaches one of the customer's bookings. */
export default function NewTicket() {
  const router = useRouter();
  const [bookingId, setBookingId] = useState<string | undefined>();
  const [label, setLabel] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("booking") ?? undefined;
    if (!isSignedIn()) return router.replace(`/login?next=${encodeURIComponent(`/help/new${id ? `?booking=${id}` : ""}`)}`);
    if (!id) return setReady(true);
    api.home.booking(id)
      .then((r) => { setBookingId(id); setLabel(`Booking ${r.booking.code} · ${r.booking.categoryName}`); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto 64px" }}>
      <h1>Raise a ticket</h1>
      <p className="muted" style={{ marginTop: 0 }}>The ZARVA team reads every ticket and replies here. You'll see it under Help &amp; support.</p>
      {ready && <TicketForm bookingId={bookingId} bookingLabel={label} onCreated={(t) => router.replace(`/help/tickets/${t.id}?new=1`)} />}
      <p style={{ marginTop: 24 }}><Link href="/help" className="muted">← Help &amp; support</Link></p>
    </div>
  );
}
