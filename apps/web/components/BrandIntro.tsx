import { logoRules } from "@zarva/brand";

/**
 * The launch animation: the ZARVA mark pops in at the centre, then Z-A-R-V-A slides in letter by
 * letter, then the caption fades in underneath. Drawn from the logo kit's master SVGs (mark and
 * stroke wordmark), so the letterforms are the real ones, not a font. Pure CSS: no JavaScript,
 * and people who switch off animations (prefers-reduced-motion) see it already in place.
 */
const LETTERS = [
  "M0 0 H60 L0 80 H60",
  "M82 80 L112 0 L142 80",
  "M164 80 V0 H192 A20 20 0 0 1 192 40 H164 M186 40 L216 80",
  "M240 0 L270 80 L300 0",
  "M322 80 L352 0 L382 80",
];

export function BrandIntro() {
  return (
    <div className="intro" role="img" aria-label={`ZARVA. ${logoRules.tagline}`}>
      <svg className="intro-mark" viewBox="10 8 80 84" width="96" height="101" aria-hidden="true">
        <defs>
          <linearGradient id="ifood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF7A6B" /><stop offset="1" stopColor="#E8475A" /></linearGradient>
          <linearGradient id="ishop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3FD08F" /><stop offset="1" stopColor="#139E66" /></linearGradient>
          <linearGradient id="ievent" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9D82FF" /><stop offset="1" stopColor="#FF6F91" /></linearGradient>
          <linearGradient id="itravel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B92FF" /><stop offset="1" stopColor="#2F5FE0" /></linearGradient>
          <linearGradient id="ihome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFC54D" /><stop offset="1" stopColor="#F09A12" /></linearGradient>
        </defs>
        <rect x="14" y="12" width="34" height="16" rx="8" fill="url(#ifood)" />
        <rect x="52" y="12" width="34" height="16" rx="8" fill="url(#ishop)" />
        <polygon points="59,37 83,37 41,63 17,63" fill="url(#ievent)" stroke="url(#ievent)" strokeWidth="6" strokeLinejoin="round" />
        <rect x="14" y="72" width="34" height="16" rx="8" fill="url(#itravel)" />
        <rect x="52" y="72" width="34" height="16" rx="8" fill="url(#ihome)" />
      </svg>
      <svg className="intro-word" viewBox="-20 -26 422 132" width="211" height="66" aria-hidden="true">
        <g fill="none" stroke="#F6F5FB" strokeWidth="11" strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit="4">
          {LETTERS.map((d, i) => (
            <path key={i} d={d} className="intro-letter" style={{ animationDelay: `${0.55 + i * 0.14}s` }} />
          ))}
        </g>
      </svg>
      <p className="intro-caption">{logoRules.tagline}</p>
    </div>
  );
}
