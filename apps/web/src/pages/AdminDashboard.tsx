import { useEffect, useState } from "react";
import type { AdminOrder, AdminStats, AdminUser, OrderStatus } from "@oneapp/shared";
import { CATEGORY_BY_SLUG } from "@oneapp/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const ORDER_STATUSES: OrderStatus[] = ["pending_payment", "confirmed", "completed", "cancelled"];

const STATUS_STYLES: Record<string, string> = {
  pending_payment: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400",
  confirmed: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400",
  completed: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400",
  cancelled: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400",
};

type Tab = "overview" | "users" | "orders";

/** Admin-only console: platform stats, every user account (with activate/deactivate), and
 *  every order across every user (with status changes). The server independently enforces
 *  admin access on every request here — this page is a convenience UI, not the security boundary. */
export function AdminDashboard() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [s, u, o] = await Promise.all([api.adminStats(), api.adminListUsers(), api.adminListOrders()]);
      setStats(s);
      setUsers(u);
      setOrders(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    setError(null);
    try {
      const updated = await api.adminSetUserActive(u.id, !u.isActive);
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that user");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(o: AdminOrder, status: OrderStatus) {
    setBusyId(o.id);
    setError(null);
    try {
      const updated = await api.adminSetOrderStatus(o.id, status);
      setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that order");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-500">Loading admin console…</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">🛠️ Admin console</h1>
        <p className="text-slate-500 text-sm">Platform-wide view — every user's orders and account, in one place.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 border-b border-slate-200">
        {(["overview", "users", "orders"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total users" value={stats.totalUsers} />
            <StatCard label="Active users" value={stats.activeUsers} />
            <StatCard label="Total orders" value={stats.totalOrders} />
            <StatCard label="Revenue" value={`₹${stats.totalRevenue.toLocaleString("en-IN")}`} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-surface border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold mb-2 text-sm">Orders by category</h2>
              <div className="space-y-1.5 text-sm">
                {Object.entries(stats.ordersByCategory).map(([slug, count]) => (
                  <div key={slug} className="flex justify-between">
                    <span className="text-slate-600">
                      {CATEGORY_BY_SLUG[slug]?.icon ?? "🧾"} {CATEGORY_BY_SLUG[slug]?.name ?? slug}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold mb-2 text-sm">Orders by status</h2>
              <div className="space-y-1.5 text-sm">
                {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between items-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
                      {status}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div>
        <p className="sm:hidden text-xs text-slate-400 mb-1">↔ Swipe to see more columns</p>
        <div className="bg-surface border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Orders</th>
                <th className="px-4 py-2 font-medium">Spent</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {u.email}
                    {u.authProvider === "google" && <span className="ml-1.5 text-xs text-blue-700 dark:text-blue-400">(Google)</span>}
                  </td>
                  <td className="px-4 py-2">
                    {u.role === "admin" ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400">admin</span>
                    ) : (
                      <span className="text-xs text-slate-500">user</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{u.orderCount}</td>
                  <td className="px-4 py-2">₹{u.totalSpent.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.isActive ? "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {u.isActive ? "active" : "deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={busyId === u.id || u.id === me?.id}
                      title={u.id === me?.id ? "You can't deactivate your own account" : undefined}
                      className={`text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
                        u.isActive
                          ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60"
                          : "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/60"
                      }`}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {tab === "orders" && (
        <div>
        <p className="sm:hidden text-xs text-slate-400 mb-1">↔ Swipe to see more columns</p>
        <div className="bg-surface border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Payment</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Placed</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const category = CATEGORY_BY_SLUG[o.categorySlug];
                return (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium">{o.userName}</div>
                      <div className="text-xs text-slate-500">{o.userEmail}</div>
                    </td>
                    <td className="px-4 py-2">
                      {category?.icon ?? "🧾"} {category?.name ?? o.categorySlug}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600 uppercase">{o.paymentMethod}</td>
                    <td className="px-4 py-2 font-medium">₹{o.total.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <select
                        value={o.status}
                        disabled={busyId === o.id}
                        onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
                        className={`text-xs font-medium px-2 py-1 rounded-md border-0 disabled:opacity-40 ${
                          STATUS_STYLES[o.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
