"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AdminCodeForm } from "../../../components/AdminCodeForm";
import { SignIn } from "../../../components/SignIn";
import { api } from "../../../lib/api";
import { areaHome, safeNext, signOut } from "../../../lib/roles";

/**
 * Admin sign-in: mobile OTP for a number listed in ADMIN_PHONES, then the authenticator code.
 * A number that isn't an admin is signed out again here instead of landing in the customer app.
 */
export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"otp" | "code">("otp");
  const [refused, setRefused] = useState(0);

  const go = useCallback(() => router.replace(safeNext() ?? areaHome.admin), [router]);

  const done = useCallback(async () => {
    const s = await api.adminStatus();
    if (!s.admin) {
      await signOut();
      setRefused((n) => n + 1); // remounts the form so they can try another number
      return;
    }
    if (s.unlocked) go();
    else setStep("code");
  }, [go]);

  if (step === "code") return <AdminCodeForm onUnlocked={go} />;

  return (
    <SignIn key={refused} title="ZARVA Admin" subtitle="For the ZARVA team only. Sign in with your admin mobile number." phoneOnly onSignedIn={done}>
      {refused > 0
        ? <p className="error" role="alert" style={{ margin: 0 }}>That number does not have admin access, so you were signed out. Customers sign in <Link href="/login">here</Link>.</p>
        : <><span>Not on the ZARVA team?</span> <Link href="/login">Customer sign-in</Link></>}
    </SignIn>
  );
}
