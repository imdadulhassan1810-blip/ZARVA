"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSignedIn } from "../lib/api";
import { areaHome, areaLogin, areaOf, signOut } from "../lib/roles";
import { Logo } from "./Logo";

const tag = { customer: null, partner: "Partner", admin: "Admin" } as const;

/**
 * Each app has its own header. The customer header has only customer things; the partner and
 * admin headers have none of them. The partner app's menu (Jobs, Earnings, Profile) is in /pro.
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const area = areaOf(pathname);
  const [signedIn, setSignedIn] = useState(false);

  // Layout persists across client navigation, so re-check on every route change.
  useEffect(() => setSignedIn(isSignedIn(area)), [pathname, area]);

  const isLogin = pathname.endsWith("/login");

  return (
    <header className={`header header-${area}`}>
      <Link href={areaHome[area]} aria-label="ZARVA home" className="brand">
        <Logo width={128} />
        {tag[area] && <span className={`area-tag area-${area}`}>{tag[area]}</span>}
      </Link>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {area === "customer" && (
          <>
            {signedIn && <Link className="btn btn-ghost hide-sm" href="/home-services/bookings">Bookings</Link>}
            {!isLogin && <Link className="btn btn-ghost" href={signedIn ? "/account" : "/login"}>{signedIn ? "Account" : "Sign in"}</Link>}
          </>
        )}
        {area === "partner" && !pathname.startsWith("/pro") && !isLogin && (
          <Link className="btn btn-ghost" href={signedIn ? "/pro" : areaLogin.partner}>{signedIn ? "Open partner app" : "Sign in"}</Link>
        )}
        {area === "admin" && signedIn && !isLogin && (
          <button className="btn btn-ghost" onClick={async () => { await signOut("admin"); router.replace(areaLogin.admin); }}>Sign out</button>
        )}
      </nav>
    </header>
  );
}
