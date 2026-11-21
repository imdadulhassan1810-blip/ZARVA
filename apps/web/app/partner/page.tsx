import Link from "next/link";
import { gradient } from "@zarva/brand";

export const metadata = { title: "Become a ZARVA partner · Durgapur" };

/** Public page that recruits professionals. Sign-in is /partner/login; the KYC steps are at /pro. */
export default function Partner() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto 64px" }}>
      <section className="partner-hero" style={{ background: gradient("home") }}>
        <h1>Earn with ZARVA in Durgapur</h1>
        <p>Electricians, plumbers, AC technicians, carpenters, cleaners and beauticians: get jobs near your home on your phone, at fixed prices.</p>
        <div className="row"><Link className="btn" href="/pro">Start sign-up</Link><Link className="btn btn-ghost partner-signin" href="/partner/login">Sign in</Link></div>
      </section>

      <h2>Why join</h2>
      <div className="benefits">
        <div className="card"><strong>Jobs near you</strong><span className="muted">Pick the areas and work you do. Accept only the jobs you want.</span></div>
        <div className="card"><strong>Fixed prices</strong><span className="muted">No bargaining. The customer sees the price before booking.</span></div>
        <div className="card"><strong>Paid every week</strong><span className="muted">Straight to your UPI or bank. See every rupee in the app.</span></div>
        <div className="card"><strong>Low commission</strong><span className="muted">ZARVA keeps 20% of the job price. Spare parts are yours to bill at MRP.</span></div>
      </div>

      <h2>How it works</h2>
      <ol className="how card">
        <li><span>Sign in with your mobile number.</span></li>
        <li><span>Tell us your work and area, upload an ID proof and a photo of yourself.</span></li>
        <li><span>Add the UPI ID or bank account where you want your money.</span></li>
        <li><span>We check your documents, usually within 2 working days, and send you an SMS.</span></li>
        <li><span>Start accepting jobs. Customers give you a 4-digit code when you arrive.</span></li>
      </ol>

      <h2>What you need</h2>
      <div className="card stack">
        <div>• A smartphone with a working mobile number</div>
        <div>• One ID proof: masked Aadhaar (download it from the UIDAI website), PAN, Voter ID or driving licence</div>
        <div>• A clear photo of your face</div>
        <div>• A UPI ID or a bank account in your name</div>
      </div>

      <div style={{ marginTop: 24 }}><Link className="btn" href="/pro">Start sign-up</Link></div>
    </div>
  );
}
