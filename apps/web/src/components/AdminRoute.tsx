import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Gates the admin console UI on role. The server enforces the real access control on every
 *  admin request independently — this only keeps a non-admin from seeing the page at all. */
export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) return <div className="text-center py-20 text-slate-500">Loading…</div>;
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}
