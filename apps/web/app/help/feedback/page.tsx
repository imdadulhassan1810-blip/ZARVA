"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSignedIn } from "../../../lib/api";
import { FeedbackForm } from "../../../components/Support";

export default function SendFeedback() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!isSignedIn()) router.replace("/login?next=/help/feedback");
  }, [router]);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto 64px" }}>
      <h1>Send feedback</h1>
      {sent ? (
        <div className="banner-ok">Thank you! The ZARVA team reads all feedback.</div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Tell us what to add, fix or keep. It goes straight to the team.</p>
          <FeedbackForm onSent={() => setSent(true)} />
        </>
      )}
      <p style={{ marginTop: 24 }}><Link href="/help" className="muted">← Help &amp; support</Link></p>
    </div>
  );
}
