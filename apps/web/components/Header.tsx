"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isSignedIn } from "../lib/api";
import { Logo } from "./Logo";

export function Header() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  // Layout persists across client navigation, so re-check on every route change.
  useEffect(() => setSignedIn(isSignedIn()), [pathname]);
  return (
    <header className="header">
      <Link href="/" aria-label="ZARVA home">
        <Logo width={128} />
      </Link>
      <Link className="btn btn-ghost" href={signedIn ? "/account" : "/login"}>
        {signedIn ? "Account" : "Sign in"}
      </Link>
    </header>
  );
}
