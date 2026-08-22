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
        <div className="font-medium">{user.email}</div>
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
    </div>
  );
}
