import { FormEvent, useState } from "react";
import { BILLER_TYPES } from "@oneapp/shared";
import type { Bill } from "@oneapp/shared";
import { api } from "../lib/api";
import { PaymentActions } from "../components/PaymentActions";

export function Bills() {
  const [billerType, setBillerType] = useState<string>(BILLER_TYPES[0].slug);
  const [consumerNumber, setConsumerNumber] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  async function onLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBill(null);
    setPaid(false);
    setLoading(true);
    try {
      setBill(await api.lookupBill(billerType, consumerNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">🧾 Bill Payments</h1>
        <p className="text-slate-500 text-sm">Electricity, water, mobile, DTH, broadband & credit card.</p>
      </div>

      <form onSubmit={onLookup} className="bg-surface border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Biller</label>
          <select
            value={billerType}
            onChange={(e) => {
              setBillerType(e.target.value);
              setBill(null);
              setPaid(false);
            }}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            {BILLER_TYPES.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.icon} {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Consumer / account number</label>
          <input
            required
            value={consumerNumber}
            onChange={(e) => setConsumerNumber(e.target.value)}
            placeholder="e.g. 1234567890"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-md py-2 font-medium"
        >
          {loading ? "Fetching bill…" : "Fetch bill"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {bill && (
        <div className="bg-surface border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Biller</span>
            <span className="font-medium">{bill.billerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Consumer no.</span>
            <span className="font-medium">{bill.consumerNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Due date</span>
            <span className="font-medium">{new Date(bill.dueDate).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between border-t pt-3">
            <span className="font-semibold">Amount due</span>
            <span className="text-xl font-bold text-brand-700">₹{bill.amountDue.toLocaleString("en-IN")}</span>
          </div>

          {paid ? (
            <p className="text-center text-green-700 dark:text-green-400 font-medium">✅ Payment successful!</p>
          ) : (
            <PaymentActions
              label={`Pay ₹${bill.amountDue.toLocaleString("en-IN")}`}
              onMockPay={() =>
                api.payBill({
                  billerType: bill.billerType,
                  billerName: bill.billerName,
                  consumerNumber: bill.consumerNumber,
                  amount: bill.amountDue,
                })
              }
              onRazorpayInit={(preferredMethod) =>
                api.payBillWithRazorpay({
                  billerType: bill.billerType,
                  billerName: bill.billerName,
                  consumerNumber: bill.consumerNumber,
                  amount: bill.amountDue,
                  preferredMethod,
                })
              }
              onSuccess={() => setPaid(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
