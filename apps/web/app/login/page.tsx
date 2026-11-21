"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { LoginResult } from "@zarva/core";
import { SignIn } from "../../components/SignIn";
import { api } from "../../lib/api";
import { safeNext } from "../../lib/roles";

/** Customer app sign-in. Partners sign in at /partner/login and the ZARVA team at /admin/login: separate apps. */
export default function Login() {
  const router = useRouter();

  const done = useCallback((r: LoginResult) => {
    const next = safeNext("customer");
    // New or incomplete accounts go to the account page to add a name and a phone (needed for bookings).
    const incomplete = r.isNewUser || !r.user.name || !r.user.phone;
    router.replace(incomplete ? `/account?welcome=1${next ? `&next=${encodeURIComponent(next)}` : ""}` : (next ?? "/"));
  }, [router]);

  return <SignIn client={api} title="Sign in or sign up" subtitle="One account for every ZARVA service." onSignedIn={done} />;
}
