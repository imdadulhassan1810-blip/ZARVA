/**
 * OneApp's mark: three overlapping rounded shapes converging inside a squircle badge —
 * "many services, one app." Built as inline SVG (not a raster asset) so it stays crisp
 * at any size and can pick up currentColor / gradient stops without shipping a file.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="oneapp-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D54FB" />
          <stop offset="1" stopColor="#FF6B4A" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#oneapp-logo-grad)" />
      <circle cx="13" cy="12.5" r="6.5" fill="white" fillOpacity="0.95" />
      <circle cx="19.5" cy="12.5" r="6.5" fill="white" fillOpacity="0.55" />
      <circle cx="16" cy="19" r="6.5" fill="white" fillOpacity="0.8" />
    </svg>
  );
}

export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display font-bold tracking-tight" style={{ fontSize: size * 0.62 }}>
        OneApp
      </span>
    </span>
  );
}
