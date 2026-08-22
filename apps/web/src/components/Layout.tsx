import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-600 text-white sticky top-0 z-10 shadow">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span aria-hidden>🧩</span> OneApp
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <NavLink to="/orders" className="hover:underline">
              Orders
            </NavLink>
            <NavLink to="/bills" className="hover:underline">
              Bill Payments
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin" className="hover:underline">
                🛠️ Admin
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/cart" className="relative hover:underline text-sm font-medium">
              🛒 Cart
              {count > 0 && (
                <span className="absolute -top-2 -right-3 bg-amber-400 text-brand-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </Link>
            {user ? (
              <div className="flex items-center gap-3 text-sm">
                <Link to="/profile" className="hover:underline">
                  Hi, {user.name.split(" ")[0]}
                </Link>
                <button
                  onClick={() => logout()}
                  className="bg-brand-700 hover:bg-brand-800 px-3 py-1.5 rounded-md"
                >
                  Log out
                </button>
              </div>
            ) : (
              <Link to="/login" className="bg-brand-700 hover:bg-brand-800 px-3 py-1.5 rounded-md text-sm">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t bg-white text-center text-sm text-slate-500 py-6">
        OneApp — cabs, hotels, flights, trains, buses, groceries, stationary, electronics,
        clothing, gas & bill payments, all in one place.
      </footer>
    </div>
  );
}
