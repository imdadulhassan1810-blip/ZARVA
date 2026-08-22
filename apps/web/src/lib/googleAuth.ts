// Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client) —
// loaded as a plain script tag, same pattern as Razorpay Checkout.js (see ./razorpay.ts).
interface GoogleCredentialResponse {
  credential: string; // a signed Google ID token (JWT) — verified server-side, never trusted as-is
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
}

interface GoogleButtonOptions {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let loadPromise: Promise<boolean> | null = null;

export function loadGoogleIdentityScript(): Promise<boolean> {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return loadPromise;
}

export type { GoogleCredentialResponse, GoogleButtonOptions };
