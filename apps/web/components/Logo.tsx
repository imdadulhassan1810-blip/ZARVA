/** Horizontal lockup. Kit rule: min 120px wide; caption version needs 200px. */
export function Logo({ width = 140, caption = false }: { width?: number; caption?: boolean }) {
  const w = Math.max(width, caption ? 200 : 120);
  const base = caption ? "zarva-lockup-horizontal-caption-on" : "zarva-lockup-horizontal-on";
  return (
    <picture>
      <source srcSet={`/brand/${base}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/brand/${base}-light.svg`} alt="ZARVA" width={w} style={{ height: "auto", display: "block" }} />
    </picture>
  );
}
