"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { SignIn } from "../../../components/SignIn";
import { partnerApi } from "../../../lib/api";
import { areaHome, safeNext } from "../../../lib/roles";

/**
 * Partner app sign-in. New professionals use the same box to sign up: after the code they land in
 * the partner app, which shows the KYC sign-up steps until an admin approves them, and jobs after.
 * This opens the partner app only; the same number's customer account stays separate.
 */
export default function PartnerLogin() {
  const router = useRouter();
  const done = useCallback(() => router.replace(safeNext("partner") ?? areaHome.partner), [router]);
  return (
    <SignIn
      client={partnerApi}
      title="ZARVA Partner"
      subtitle="Sign in or sign up with your mobile number to get jobs, see your earnings and get paid."
      phoneOnly
      onSignedIn={done}
    />
  );
}
