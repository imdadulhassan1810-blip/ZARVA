"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { addressInputSchema, formatPhone, type Address, type PublicUser } from "@zarva/core";
import { CodeForm } from "../../components/CodeForm";
import { api, isSignedIn } from "../../lib/api";

const emptyAddress = { label: "home", name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "West Bengal", pincode: "" };

export default function Account() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [name, setName] = useState("");
  const [adding2, setAdding2] = useState<"phone" | "email" | null>(null);
  const [lang, setLang] = useState<PublicUser["preferredLanguage"]>("en");
  const [whatsapp, setWhatsapp] = useState(false);
  const [draft, setDraft] = useState(emptyAddress);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ user }, { addresses }] = await Promise.all([api.me(), api.listAddresses()]);
      setUser(user);
      setName(user.name ?? "");
      setLang(user.preferredLanguage);
      setWhatsapp(user.whatsappOptIn);
      setAddresses(addresses);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!isSignedIn()) return router.replace("/login");
    const q = new URLSearchParams(window.location.search);
    setWelcome(q.has("welcome"));
    const n = q.get("next");
    setNext(n && n.startsWith("/") && !n.startsWith("//") ? n : null);
    void load();
  }, [load, router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.updateMe({ name: name.trim() || undefined, preferredLanguage: lang, whatsappOptIn: whatsapp });
      setUser(r.user);
      setMsg("Profile saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = addressInputSchema.safeParse({ ...draft, line2: draft.line2 || null, landmark: draft.landmark || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the address");
    try {
      await api.addAddress(parsed.data);
      setDraft(emptyAddress);
      setAdding(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const field = (k: keyof typeof emptyAddress, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label>
      {label}
      <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} {...props} />
    </label>
  );

  if (!user) return <p className="muted">Loading…</p>;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto 48px" }}>
      <h1>{welcome ? "Welcome to ZARVA" : "Your account"}</h1>
      {!user.phone && (
        <div className="notice" role="status">
          <strong>Add your mobile number to book services.</strong> Our professionals call you before they arrive, so every booking needs a verified number.
          {adding2 !== "phone" && <div style={{ marginTop: 8 }}><button className="btn" onClick={() => setAdding2("phone")}>Add mobile number</button></div>}
        </div>
      )}
      {next && user.phone && <p><a className="btn" href={next}>Continue booking →</a></p>}

      <h2>Sign-in &amp; contact</h2>
      <div className="card stack">
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Mobile</div>
            {user.phone ? <div>{formatPhone(user.phone)} <span className="verified">✓ Verified</span></div> : <div className="muted">Not added</div>}
          </div>
          {!user.phone && adding2 !== "phone" && <button className="btn btn-ghost" style={{ flex: "0 0 auto" }} onClick={() => setAdding2("phone")}>Add</button>}
        </div>
        {adding2 === "phone" && (
          <CodeForm kind="phone" submitLabel="Add number" onSend={(p) => api.requestPhoneLink(p)} onVerify={async (p, c) => { setUser((await api.verifyPhoneLink(p, c)).user); setAdding2(null); }} />
        )}
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Email</div>
            {user.email ? <div>{user.email} <span className="verified">✓ Verified</span></div> : <div className="muted">Not added</div>}
          </div>
          {!user.email && adding2 !== "email" && <button className="btn btn-ghost" style={{ flex: "0 0 auto" }} onClick={() => setAdding2("email")}>Add</button>}
        </div>
        {adding2 === "email" && (
          <CodeForm kind="email" submitLabel="Add email" onSend={(e) => api.requestEmailLink(e)} onVerify={async (e, c) => { setUser((await api.verifyEmailLink(e, c)).user); setAdding2(null); }} />
        )}
        <div>
          <div className="muted" style={{ fontSize: 13 }}>Google</div>
          <div>{user.hasGoogle ? <span className="verified">✓ Connected</span> : <span className="muted">Not connected. Sign in with Google once to connect it (same email).</span>}</div>
        </div>
      </div>

      <h2>Profile</h2>
      <form className="card stack" onSubmit={saveProfile}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="bn">বাংলা</option>
          </select>
        </label>
        <label className="choice">
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
          <span>Send booking updates on WhatsApp too <span className="muted">(we always send SMS)</span></span>
        </label>
        {msg && <p className="muted" role="status">{msg}</p>}
        <button className="btn">Save profile</button>
      </form>

      <h2>Saved addresses</h2>
      <div className="stack">
        {addresses.length === 0 && <p className="muted">No addresses yet.</p>}
        {addresses.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong style={{ textTransform: "capitalize" }}>{a.label}</strong>
              {a.isDefault && <span className="muted"> · Default</span>}
              <div>{a.name}, {formatPhone(a.phone)}</div>
              <div className="muted">{[a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`, a.state].filter(Boolean).join(", ")}</div>
            </div>
            <div className="stack" style={{ flex: "0 0 auto" }}>
              {!a.isDefault && <button className="btn btn-ghost" onClick={async () => { await api.updateAddress(a.id, { isDefault: true }); await load(); }}>Make default</button>}
              <button className="btn btn-danger" onClick={async () => { await api.deleteAddress(a.id); await load(); }}>Delete</button>
            </div>
          </div>
        ))}
        {adding ? (
          <form className="card stack" onSubmit={saveAddress}>
            <label>
              Label
              <select value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}>
                <option value="home">Home</option><option value="work">Work</option><option value="other">Other</option>
              </select>
            </label>
            <div className="row">{field("name", "Contact name")}{field("phone", "Contact phone", { inputMode: "tel" })}</div>
            {field("line1", "House / flat, street")}
            {field("line2", "Area / locality (optional)")}
            {field("landmark", "Landmark (optional)")}
            <div className="row">{field("city", "City")}{field("pincode", "PIN code", { inputMode: "numeric", maxLength: 6 })}</div>
            {field("state", "State")}
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn">Save address</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>+ Add address</button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <h2>Session</h2>
      <button className="btn btn-ghost" onClick={async () => { await api.logout(); router.replace("/"); }}>Sign out</button>
    </div>
  );
}
