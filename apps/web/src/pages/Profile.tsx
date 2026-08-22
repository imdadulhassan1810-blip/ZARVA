import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Profile() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-sm mx-auto bg-white border border-slate-200 rounded-xl p-6 space-y-3">
      <h1 className="text-xl font-bold mb-2">My profile</h1>
      <div>
        <div className="text-xs text-slate-500">Name</div>
        <div className="font-medium">{user.name}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">Email</div>
        <div className="font-medium flex items-center gap-2">
          {user.email}
          {user.authProvider === "google" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">via Google</span>
          )}
        </div>
      </div>
      {user.phone && (
        <div>
          <div className="text-xs text-slate-500">Phone</div>
          <div className="font-medium">{user.phone}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-slate-500">Member since</div>
        <div className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</div>
      </div>
      {user.role === "admin" && (
        <div className="pt-2 border-t">
          <div className="text-xs text-slate-500 mb-1">Role</div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-block mb-3">admin</span>
          <Link
            to="/admin"
            className="block text-center bg-brand-600 hover:bg-brand-700 text-white rounded-md py-2 text-sm font-medium"
          >
            🛠️ Open admin console
          </Link>
        </div>
      )}
    </div>
  );
}
