"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRupees, type HomeBooking } from "@zarva/core";
import { StatusChip, itemsLine, when } from "../../../components/BookingBits";
import { api, isSignedIn } from "../../../lib/api";

export default function Bookings() {
  const router = useRouter();
  const [list, setList] = useState<HomeBooking[] | null>(null);
  useEffect(() => {
    if (!isSignedIn()) return router.replace("/login?next=/home-services/bookings");
    api.home.bookings().then((r) => setList(r.bookings)).catch(() => router.replace("/login?next=/home-services/bookings"));
  }, [router]);

  if (!list) return <p className="muted">Loading…</p>;
  return (
    <div style={{ maxWidth: 680, margin: "0 auto 64px" }}>
      <h1>Your bookings</h1>
      {list.length === 0 && (
        <div className="card stack">
          <p style={{ margin: 0 }}>No bookings yet.</p>
          <Link className="btn" href="/home-services">Book a service</Link>
        </div>
      )}
      <div className="stack">
        {list.map((b) => (
          <Link key={b.id} href={`/home-services/bookings/${b.id}`} className="card booking-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{b.categoryName}</strong><StatusChip b={b} />
              </div>
              <div className="muted ellipsis">{itemsLine(b)}</div>
              <div style={{ fontSize: 14 }}>{when(b)}</div>
            </div>
            <strong>{formatRupees(b.totalPaise)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
