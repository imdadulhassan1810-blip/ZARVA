import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `hover:text-white transition ${isActive ? "text-white" : "text-white/75"}`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block py-2.5 ${isActive ? "text-white font-medium" : "text-white/80"}`;

export function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Below `sm` there's no room for the nav/auth links next to the logo, cart, and theme
  // toggle — this is what used to make Orders/Bill Payments/Admin/Profile unreachable on
  // a phone (they were just `hidden` with nothing replacing them). Close automatically on
  // navigation so it doesn't stay open over the next page.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-600 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0">
            <Logo size={30} />
          </Link>
          <nav className="hidden sm:flex items-center gap-5 text-sm font-medium">
            <NavLink to="/orders" className={navLinkClass}>
              Orders
            </NavLink>
            <NavLink to="/bills" className={navLinkClass}>
              Bill Payments
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin" className={navLinkClass}>
                🛠️ Admin
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/cart" className="relative text-white/90 hover:text-white transition text-sm font-medium">
              🛒 Cart
              {count > 0 && (
                <span className="absolute -top-2 -right-3 bg-accent-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </Link>
            <ThemeToggle />
            {user ? (
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <Link to="/profile" className="text-white/90 hover:text-white transition hidden md:inline">
                  Hi, {user.name.split(" ")[0]}
                </Link>
                <button
                  onClick={() => logout()}
                  className="bg-white/15 hover:bg-white/25 transition px-3 py-1.5 rounded-lg font-medium"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <Link to="/register" className="text-white/90 hover:text-white transition font-medium">
                  Sign up
                </Link>
                <Link to="/login" className="bg-white/15 hover:bg-white/25 transition px-3 py-1.5 rounded-lg font-medium">
                  Log in
                </Link>
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="sm:hidden h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-lg"
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="sm:hidden border-t border-white/15 px-4 py-2 text-sm">
            <NavLink to="/orders" className={mobileNavLinkClass}>
              Orders
            </NavLink>
            <NavLink to="/bills" className={mobileNavLinkClass}>
              Bill Payments
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin" className={mobileNavLinkClass}>
                🛠️ Admin console
              </NavLink>
            )}
            <div className="border-t border-white/15 mt-2 pt-2">
              {user ? (
                <>
                  <Link to="/profile" className="block py-2.5 text-white/80">
                    👤 Hi, {user.name.split(" ")[0]}
                  </Link>
                  <button onClick={() => logout()} className="block w-full text-left py-2.5 text-white/80">
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/register" className="block py-2.5 text-white/80">
                    Sign up
                  </Link>
                  <Link to="/login" className="block py-2.5 text-white/80">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-surface text-center text-sm text-slate-500 py-8">
        <Logo size={20} className="justify-center mb-3 opacity-80" />
        <p className="max-w-2xl mx-auto px-4">
          OneApp — cabs, hotels, flights, trains, buses, groceries, stationary, electronics,
          clothing, gas &amp; bill payments, all in one place.
        </p>
      </footer>
    </div>
  );
}
