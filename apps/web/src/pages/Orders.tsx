import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";

const STATUS_STYLES: Record<string, string> = {
  pending_payment: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400",
  confirmed: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400",
  completed: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400",
  cancelled: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400",
};

// Same guard the backend enforces — kept here only to decide whether the button renders,
// never trusted as the actual access control (the server independently re-checks and
// also blocks a trackable trip that's already in progress).
const CANCELLABLE_STATUSES: Order["status"][] = ["pending_payment", "confirmed"];

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, []);

  async function cancelOrder(order: Order) {
    if (!window.confirm("Cancel this order? This can't be undone.")) return;
    setBusyId(order.id);
    setError(null);
    try {
      const updated = await api.cancelOrder(order.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel that order");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">📦</div>
        <p className="text-slate-500">No orders yet — go book or buy something!</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Your orders</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {orders.map((order) => {
        const category = CATEGORY_BY_SLUG[order.categorySlug];
        return (
          <div key={order.id} className="bg-surface border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <span>{category?.icon ?? "🧾"}</span>
                <span>{category?.name ?? order.categorySlug}</span>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                {order.status}
              </span>
            </div>
            <ul className="mt-2 text-sm text-slate-600 space-y-1">
              {order.items.map((item, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>
                    {item.listingTitle} × {item.quantity}
                  </span>
                  <span>₹{(item.unitPrice * item.quantity).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
              <span className="text-slate-400 whitespace-nowrap shrink-0">{new Date(order.createdAt).toLocaleString()}</span>
              <div className="flex items-center gap-3 ml-auto">
                {CANCELLABLE_STATUSES.includes(order.status) && (
                  <button
                    onClick={() => cancelOrder(order)}
                    disabled={busyId === order.id}
                    className="text-red-600 font-medium hover:underline disabled:opacity-50"
                  >
                    {busyId === order.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
                {Boolean(order.details.tracking) && (
                  <Link to={`/tracking/${order.id}`} className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline">
                    {order.status === "completed" ? "View trip" : "Track live 🔴"}
                  </Link>
                )}
                <span className="font-bold">₹{order.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
