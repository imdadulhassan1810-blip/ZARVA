// Minimal typing for the Razorpay Checkout.js widget (https://checkout.razorpay.com/v1/checkout.js).
// It's loaded as a plain script tag rather than an npm package — that's Razorpay's
// documented web integration and keeps the bundle free of a payment SDK unless it's
// actually used.
interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return loadPromise;
}

/** Opens the Razorpay Checkout modal. Resolves with the signed payment response on success, or null if the user closed the modal or the script failed to load. */
export async function openRazorpayCheckout(options: Omit<RazorpayOptions, "handler" | "modal">) {
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) return null;

  return new Promise<RazorpaySuccessResponse | null>((resolve) => {
    const instance = new window.Razorpay!({
      ...options,
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    instance.open();
  });
}
