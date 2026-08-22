import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="text-center py-20 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
