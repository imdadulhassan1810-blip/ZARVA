"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { addressInputSchema, formatPhone, type Address, type PublicUser } from "@zarva/core";
import { api, isSignedIn } from "../../lib/api";

const emptyAddress = { label: "home", name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "West Bengal", pincode: "" };

export default function Account() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lang, setLang] = useState<PublicUser["preferredLanguage"]>("en");
  const [draft, setDraft] = useState(emptyAddress);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ user }, { addresses }] = await Promise.all([api.me(), api.listAddresses()]);
      setUser(user);
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setLang(user.preferredLanguage);
      setAddresses(addresses);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!isSignedIn()) return router.replace("/login");
    setWelcome(new URLSearchParams(window.location.search).has("welcome"));
    void load();
  }, [load, router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.updateMe({ name: name.trim() || undefined, email: email.trim() || null, preferredLanguage: lang });
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
      <p className="muted">{formatPhone(user.phone)}</p>

      <h2>Profile</h2>
      <form className="card stack" onSubmit={saveProfile}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="bn">বাংলা</option>
          </select>
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
