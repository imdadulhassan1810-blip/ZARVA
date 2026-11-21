"use client";
import { useState } from "react";
import {
  homeProDocKinds, homeProDocLabel, homeProIdTypeLabel, homeProIdTypes, homeProRequiredDocs,
  type HomeCategory, type HomePro, type HomeProDocKind, type HomeProIdType,
} from "@zarva/core";
import { partnerApi as api } from "../lib/api";
import { prepareUpload } from "../lib/files";

type Step = "details" | "documents" | "payout" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Your work" },
  { id: "documents", label: "ID & photo" },
  { id: "payout", label: "Payout account" },
  { id: "review", label: "Submit" },
];

/** Partner sign-up: 4 short steps, each saved as you go, so a pro can stop and come back. */
export function ProOnboarding({ pro, cats, onChange }: { pro: HomePro | null; cats: HomeCategory[]; onChange: (p: HomePro) => void }) {
  const firstOpen: Step = !pro ? "details" : pro.documents.length < homeProRequiredDocs.length ? "documents"
    : !pro.payout.upi && !pro.payout.bankAccountMasked ? "payout" : "review";
  const [step, setStep] = useState<Step>(firstOpen);
  const idx = STEPS.findIndex((s) => s.id === step);
  const locked = pro?.status === "pending";

  if (locked) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto 64px" }}>
        <h1>Thanks, {pro.name.split(" ")[0]}</h1>
        <div className="card stack">
          <span className="chip chip-warn" style={{ alignSelf: "flex-start" }}>Under review</span>
          <p style={{ margin: 0 }}>We are checking your documents. This usually takes up to 2 working days. You will get an SMS as soon as you are approved, and then you can start taking jobs here.</p>
          <p className="muted" style={{ margin: 0 }}>Uploaded: {pro.documents.map((d) => homeProDocLabel[d.kind]).join(", ")}. Payout to {pro.payout.upi ?? pro.payout.bankAccountMasked}.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto 64px" }}>
      <h1>Become a ZARVA partner</h1>
      <p className="muted" style={{ marginTop: 0 }}>Takes about 5 minutes. Your progress is saved after every step.</p>
      {pro?.status === "rejected" && (
        <div className="notice" role="alert" style={{ marginBottom: 12 }}>
          <strong>We need a fix before we can approve you:</strong> {pro.rejectionReason}. Update it below and submit again.
        </div>
      )}
      <ol className="wizard" aria-label="Sign-up steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i === idx ? "on" : i < idx ? "done" : ""} aria-current={i === idx ? "step" : undefined}>{s.label}</li>
        ))}
      </ol>
      {step === "details" && <Details pro={pro} cats={cats} onSaved={(p) => { onChange(p); setStep("documents"); }} />}
      {step === "documents" && pro && <Documents pro={pro} onChange={onChange} onNext={() => setStep("payout")} onBack={() => setStep("details")} />}
      {step === "payout" && pro && <Payout pro={pro} onSaved={(p) => { onChange(p); setStep("review"); }} onBack={() => setStep("documents")} />}
      {step === "review" && pro && <Review pro={pro} cats={cats} onChange={onChange} go={setStep} />}
    </div>
  );
}

function Details({ pro, cats, onSaved }: { pro: HomePro | null; cats: HomeCategory[]; onSaved: (p: HomePro) => void }) {
  const [name, setName] = useState(pro?.name ?? "");
  const [locality, setLocality] = useState(pro?.locality ?? "");
  const [years, setYears] = useState(pro?.experienceYears != null ? String(pro.experienceYears) : "");
  const [idType, setIdType] = useState<HomeProIdType | "">(pro?.idType ?? "");
  const [picked, setPicked] = useState<string[]>(pro?.categoryIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      const body = {
        name: name.trim(), categoryIds: picked, locality: locality.trim() || undefined,
        experienceYears: years ? Number(years) : undefined, idType: idType || undefined,
      };
      try {
        onSaved(pro ? (await api.home.proUpdate(body)).pro : (await api.home.proApply({ ...body, cityId: "durgapur" })).pro);
      } catch (err) {
        setError((err as Error).message);
      } finally { setBusy(false); }
    }}>
      <label>Full name (as on your ID)<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" /></label>
      <label>Your area in Durgapur<input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="e.g. Benachity, City Centre, Bidhannagar" /></label>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>What work do you do?</legend>
        {cats.map((c) => (
          <label key={c.id} className="choice">
            <input type="checkbox" checked={picked.includes(c.id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
            <span>{c.icon} {c.name}</span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <label>Years of experience<input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
        <label>ID proof you will upload
          <select value={idType} onChange={(e) => setIdType(e.target.value as HomeProIdType)} required>
            <option value="">Choose…</option>
            {homeProIdTypes.map((t) => <option key={t} value={t}>{homeProIdTypeLabel[t]}</option>)}
          </select>
        </label>
      </div>
      {idType === "aadhaar_masked" && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Please upload a <strong>masked Aadhaar</strong> (only the last 4 digits visible). Download it free from myaadhaar.uidai.gov.in → Download Aadhaar → tick “masked Aadhaar”.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || picked.length === 0 || name.trim().length < 2 || !idType}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}

function Documents({ pro, onChange, onNext, onBack }: { pro: HomePro; onChange: (p: HomePro) => void; onNext: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState<HomeProDocKind | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<HomeProDocKind, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const have = new Set(pro.documents.map((d) => d.kind));
  const ready = homeProRequiredDocs.every((k) => have.has(k));

  async function upload(kind: HomeProDocKind, file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(kind);
    try {
      const f = await prepareUpload(file);
      onChange((await api.home.proUploadDoc(kind, f.mime, f.dataBase64)).pro);
      if (f.previewUrl) setPreviews((p) => ({ ...p, [kind]: f.previewUrl! }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>Take clear photos in good light. Only the ZARVA team can see these files; they are stored encrypted.</p>
      {homeProDocKinds.filter((k) => k !== "id_back" || pro.idType !== "pan").map((kind) => (
        <div key={kind} className="doc-row">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {previews[kind] ? <img className="doc-thumb" src={previews[kind]} alt="" /> : <div className="doc-thumb" style={{ display: "grid", placeItems: "center", fontSize: 24 }}>{have.has(kind) ? "✓" : kind === "selfie" ? "🙂" : "🪪"}</div>}
            <div>
              <strong>{homeProDocLabel[kind]}</strong>{homeProRequiredDocs.includes(kind) && <span className="muted"> · required</span>}
              <div className="muted" style={{ fontSize: 13 }}>{busy === kind ? "Uploading…" : have.has(kind) ? <span className="verified">✓ Uploaded</span> : "JPG, PNG or PDF"}</div>
            </div>
          </div>
          <label className="btn btn-ghost" style={{ flexDirection: "row", cursor: "pointer", position: "relative" }}>
            {have.has(kind) ? "Replace" : kind === "selfie" ? "Take photo" : "Upload"}
            <input type="file" accept={kind === "selfie" ? "image/*" : "image/*,application/pdf"} capture={kind === "selfie" ? "user" : undefined}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} disabled={busy !== null}
              onChange={(e) => { void upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-ghost" type="button" onClick={onBack}>Back</button>
        <button className="btn" type="button" disabled={!ready || busy !== null} onClick={onNext}>Continue</button>
      </div>
    </div>
  );
}

export function Payout({ pro, onSaved, onBack, submitLabel = "Save and continue" }: {
  pro: HomePro; onSaved: (p: HomePro) => void; onBack?: () => void; submitLabel?: string;
}) {
  const [mode, setMode] = useState<"upi" | "bank">(pro.payout.bankAccountMasked && !pro.payout.upi ? "bank" : "upi");
  const [accountName, setAccountName] = useState(pro.payout.accountName ?? pro.name);
  const [upi, setUpi] = useState(pro.payout.upi ?? "");
  const [bank, setBank] = useState("");
  const [ifsc, setIfsc] = useState(pro.payout.ifsc ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const body = mode === "upi" ? { accountName: accountName.trim(), upi: upi.trim() } : { accountName: accountName.trim(), bankAccount: bank.trim(), ifsc: ifsc.trim() };
        onSaved((await api.home.proSetPayout(body)).pro);
      } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <p className="muted" style={{ margin: 0 }}>Where should ZARVA send your earnings? It must be in your own name.</p>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "upi"} className={mode === "upi" ? "on" : ""} onClick={() => setMode("upi")}>UPI ID</button>
        <button type="button" role="tab" aria-selected={mode === "bank"} className={mode === "bank" ? "on" : ""} onClick={() => setMode("bank")}>Bank account</button>
      </div>
      <label>Account holder name<input value={accountName} onChange={(e) => setAccountName(e.target.value)} required minLength={2} /></label>
      {mode === "upi" ? (
        <label>UPI ID<input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@okaxis" autoCapitalize="none" required /></label>
      ) : (
        <div className="row">
          <label>Account number{pro.payout.bankAccountMasked && <span className="muted"> (now {pro.payout.bankAccountMasked})</span>}
            <input inputMode="numeric" value={bank} onChange={(e) => setBank(e.target.value.replace(/\D/g, ""))} required />
          </label>
          <label>IFSC<input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} required /></label>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        {onBack && <button className="btn btn-ghost" type="button" onClick={onBack}>Back</button>}
        <button className="btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

function Review({ pro, cats, onChange, go }: { pro: HomePro; cats: HomeCategory[]; onChange: (p: HomePro) => void; go: (s: Step) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const row = (label: string, value: string, s: Step) => (
    <div className="sum-row"><span><span className="muted">{label}:</span> {value}</span><button className="btn btn-ghost" type="button" onClick={() => go(s)}>Edit</button></div>
  );
  return (
    <div className="card stack">
      {row("Name", pro.name, "details")}
      {row("Work", pro.categoryIds.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", "), "details")}
      {row("Area", pro.locality ?? "Durgapur", "details")}
      {row("Documents", pro.documents.map((d) => homeProDocLabel[d.kind]).join(", ") || "None", "documents")}
      {row("Payout", pro.payout.upi ?? pro.payout.bankAccountMasked ?? "Not added", "payout")}
      {pro.missing.length > 0 && <p className="error">Still needed: {pro.missing.join(", ")}</p>}
      <label className="choice">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>The documents are mine and the details are true. I agree to ZARVA&apos;s partner terms: a commission on the job price (20% at launch), and cash I collect from customers is settled with ZARVA.</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || !agree || pro.missing.length > 0} onClick={async () => {
        setError(null);
        setBusy(true);
        try { onChange((await api.home.proSubmit()).pro); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Submitting…" : "Submit for review"}</button>
    </div>
  );
}
