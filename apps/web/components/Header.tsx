"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSignedIn } from "../lib/api";
import { areaHome, areaLogin, areaOf, loadRoles, signOut, type Roles } from "../lib/roles";
import { Logo } from "./Logo";

const tag = { customer: null, partner: "Partner", admin: "Admin" } as const;

/**
 * The header changes with the area you are in (customer, partner, admin), so a partner on /pro
 * sees a partner app, not the shopping header. Links to your other areas appear only if your
 * account has that role.
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const area = areaOf(pathname);
  const [signedIn, setSignedIn] = useState(false);
  const [roles, setRoles] = useState<Roles>({ admin: false, pro: null });

  // Layout persists across client navigation, so re-check on every route change.
  useEffect(() => {
    const s = isSignedIn();
    setSignedIn(s);
    if (s) void loadRoles().then(setRoles);
    else setRoles({ admin: false, pro: null });
  }, [pathname]);

  async function out() {
    await signOut();
    setSignedIn(false);
    router.replace(areaLogin[area]);
  }

  const isLogin = pathname.endsWith("/login");

  return (
    <header className="header">
      <Link href={areaHome[area]} aria-label="ZARVA home" className="brand">
        <Logo width={128} />
        {tag[area] && <span className={`area-tag area-${area}`}>{tag[area]}</span>}
      </Link>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {area === "customer" && (
          <>
            {roles.admin && <Link className="btn btn-ghost" href="/admin">Admin</Link>}
            {roles.pro ? <Link className="btn btn-ghost" href="/pro">Partner app</Link>
              : <Link className="btn btn-ghost hide-sm" href="/partner">Become a partner</Link>}
            {signedIn && <Link className="btn btn-ghost hide-sm" href="/home-services/bookings">Bookings</Link>}
            {!isLogin && <Link className="btn btn-ghost" href={signedIn ? "/account" : "/login"}>{signedIn ? "Account" : "Sign in"}</Link>}
          </>
        )}
        {area !== "customer" && (
          <>
            {signedIn && area === "partner" && roles.admin && <Link className="btn btn-ghost hide-sm" href="/admin">Admin</Link>}
            {signedIn && area === "admin" && roles.pro && <Link className="btn btn-ghost hide-sm" href="/pro">Partner app</Link>}
            {signedIn && <Link className="btn btn-ghost hide-sm" href="/">Book a service</Link>}
            {signedIn
              ? <button className="btn btn-ghost" onClick={() => void out()}>Sign out</button>
              : !isLogin && <Link className="btn btn-ghost" href={areaLogin[area]}>Sign in</Link>}
          </>
        )}
      </nav>
    </header>
  );
}
