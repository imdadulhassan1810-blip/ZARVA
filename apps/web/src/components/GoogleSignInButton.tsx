import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { loadGoogleIdentityScript } from "../lib/googleAuth";

interface Props {
  onCredential: (idToken: string) => void;
}

/**
 * Renders Google's official "Sign in with Google" button when the backend has a
 * GOOGLE_CLIENT_ID configured, and nothing at all otherwise — same graceful-fallback
 * shape as the Razorpay integration. `onCredential` receives the signed ID token; the
 * caller exchanges it for a OneApp session via api.loginWithGoogle (never trust it client-side).
 */
export function GoogleSignInButton({ onCredential }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getGoogleAuthConfig()
      .then(async (config) => {
        if (cancelled || !config.enabled || !config.clientId) return;
        const loaded = await loadGoogleIdentityScript();
        if (cancelled || !loaded || !window.google || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: (response) => onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
        setEnabled(true);
      })
      .catch(() => {
        // Google auth just isn't available — password login/register still works fine.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The button div must stay mounted at a stable position across the enabled/disabled
  // transition — Google's script injects its button DOM directly into it, so swapping
  // it out for a differently-shaped tree (rather than just toggling a class) would
  // silently discard that injected button.
  return (
    <div className={enabled ? "space-y-3" : "hidden"}>
      <div ref={containerRef} className="flex justify-center" />
      {enabled && (
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex-1 h-px bg-slate-200" />
          or
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}
    </div>
  );
}
