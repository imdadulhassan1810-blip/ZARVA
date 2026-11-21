"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { SignIn } from "../../../components/SignIn";
import { areaHome, safeNext } from "../../../lib/roles";

/**
 * Partner sign-in. New professionals use the same box to sign up: after the code they land on
 * /pro, which shows the KYC sign-up steps until an admin approves them, and their jobs after.
 */
export default function PartnerLogin() {
  const router = useRouter();
  const done = useCallback(() => router.replace(safeNext() ?? areaHome.partner), [router]);

  return (
    <SignIn
      title="ZARVA Partner"
      subtitle="Sign in or sign up with your mobile number to get jobs, see your earnings and get paid."
      phoneOnly
      onSignedIn={done}
    >
      <span>Want to book a service instead?</span> <Link href="/login">Customer sign-in</Link>
    </SignIn>
  );
}
