import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Order } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
  }, []);

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
      {orders.map((order) => {
        const category = CATEGORY_BY_SLUG[order.categorySlug];
        return (
          <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-4">
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
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
              <span className="text-slate-400">{new Date(order.createdAt).toLocaleString()}</span>
              <div className="flex items-center gap-3">
                {Boolean(order.details.tracking) && (
                  <Link to={`/tracking/${order.id}`} className="text-emerald-700 font-medium hover:underline">
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
