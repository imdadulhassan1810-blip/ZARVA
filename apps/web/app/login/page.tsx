"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { LoginResult } from "@zarva/core";
import { SignIn } from "../../components/SignIn";
import { safeNext } from "../../lib/roles";

/** Customer sign-in. Partners use /partner/login and admins /admin/login (same account underneath). */
export default function Login() {
  const router = useRouter();

  const done = useCallback((r: LoginResult) => {
    const next = safeNext();
    // New or incomplete accounts go to the account page to add a name and a phone (needed for bookings).
    const incomplete = r.isNewUser || !r.user.name || !r.user.phone;
    router.replace(incomplete ? `/account?welcome=1${next ? `&next=${encodeURIComponent(next)}` : ""}` : (next ?? "/"));
  }, [router]);

  return (
    <SignIn title="Sign in or sign up" subtitle="One account for every ZARVA service." onSignedIn={done}>
      <span>Are you a service professional?</span> <Link href="/partner/login">Partner sign-in</Link>
    </SignIn>
  );
}
