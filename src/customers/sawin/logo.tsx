import { SAWIN_LOGO as L } from "./logo-pfade";

/*
  Logo von Sawin Bauelemente (Pfade in logo-pfade.ts, gemeinsam mit dem PDF).
  Flächen Sand #D2B19A und Grau #B3B3B3 sind Teil des Logos; Konturen, „BAUELEMENTE“ und Linie folgen dem Token
  --logo-ink (anthrazit auf hellem, weiß auf dunklem Grund).
*/
type LogoProps = {
  /** „voll“ = Symbol mit Wortmarke SAWIN / BAUELEMENTE, „symbol“ = nur das Gebäude (eingeklappte Seitenleiste) */
  variante?: "voll" | "symbol";
  className?: string;
};

const INK = "var(--logo-ink)";

function Symbol() {
  return (
    <>
      {L.flaechen.map((p, i) => (
        <path key={i} fill={p.fill} d={p.d} />
      ))}
      <g fill="none" stroke={INK} strokeLinejoin="miter" strokeMiterlimit="10">
        {L.striche.map((p, i) => (
          <path key={i} d={p.d} strokeWidth={p.breite} />
        ))}
      </g>
    </>
  );
}

export function SawinLogo({ variante = "voll", className }: LogoProps) {
  if (variante === "symbol") {
    return (
      <svg viewBox={L.viewBoxSymbol} className={className} aria-hidden="true">
        <Symbol />
      </svg>
    );
  }
  return (
    <svg viewBox={L.viewBoxVoll} className={className} role="img" aria-label="Sawin Bauelemente">
      <Symbol />
      {L.wortmarke.map((p, i) => (
        <path key={i} fill={p.fill === "ink" ? INK : p.fill} fillRule="evenodd" d={p.d} />
      ))}
    </svg>
  );
}
