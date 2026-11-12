"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { begrenzen, tastenBreite } from "@/lib/spalten";

/**
 * Griff am rechten Rand eines Tabellenkopfs zum Ändern der Spaltenbreite (wie in Excel). Ziehen ändert die Breite,
 * Doppelklick passt sie an den Inhalt an. Tastatur: Fokus auf den Griff, Pfeil links/rechts (Umschalt: größere
 * Schritte), Pos1/Ende für Minimum/Maximum, Enter für „passend“. onEnde meldet das Ende einer Änderung (zum Speichern).
 * Der Kopf (th) braucht position: relative.
 */
export function SpaltenGriff({
  titel,
  breite,
  min,
  max,
  onBreite,
  onEnde,
  onPassend,
  amRand,
}: {
  /** letzte Spalte: Griff innen am Rand (ragt nicht über die Tabelle hinaus) */
  amRand?: boolean;
  titel: string;
  breite: number;
  min: number;
  max: number;
  onBreite: (b: number) => void;
  onEnde: () => void;
  onPassend: () => void;
}) {
  const zug = useRef<{ x: number; breite: number } | null>(null);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Breite der Spalte ${titel}`}
      aria-valuenow={breite}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Ziehen ändert die Breite, Doppelklick passt sie an"
      data-spalten-griff={titel}
      className={cn(
        "group/griff absolute top-0 bottom-0 z-10",
        amRand ? "right-0" : "-right-[5px]",
        "flex w-[10px] cursor-col-resize touch-none justify-center outline-none select-none",
        "focus-visible:[&>span]:bg-accent-text",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        zug.current = { x: e.clientX, breite };
      }}
      onPointerMove={(e) => {
        if (!zug.current) return;
        onBreite(begrenzen(zug.current.breite + e.clientX - zug.current.x, min, max));
      }}
      onPointerUp={(e) => {
        if (!zug.current) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        zug.current = null;
        onEnde();
      }}
      onPointerCancel={() => {
        zug.current = null;
      }}
      onDoubleClick={() => {
        onPassend();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          return onPassend();
        }
        const neu = tastenBreite(e.key, e.shiftKey, breite, min, max);
        if (neu === null) return;
        e.preventDefault();
        onBreite(neu);
      }}
      onKeyUp={(e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) onEnde();
      }}
    >
      <span className="h-full w-[2px] rounded-full bg-transparent transition-colors group-hover/griff:bg-line-strong" />
    </span>
  );
}

/**
 * Breite des Inhalts einer Tabellenspalte messen (für „passend“): Text der Felder bzw. Zellen in ihrer Schrift plus
 * Innenabstände des Feldes. Zellen tragen data-spalte="<schluessel>".
 */
export function inhaltsBreiten(tabelle: HTMLElement, schluessel: string): number[] {
  const leinwand = document.createElement("canvas").getContext("2d");
  if (!leinwand) return [];
  const breiten: number[] = [];
  for (const zelle of tabelle.querySelectorAll<HTMLElement>(`[data-spalte="${schluessel}"]`)) {
    const feld = zelle.querySelector<HTMLInputElement | HTMLSelectElement>("input:not([type=hidden]), select");
    const ziel = feld ?? zelle;
    const stil = getComputedStyle(ziel);
    leinwand.font = `${stil.fontWeight} ${stil.fontSize} ${stil.fontFamily}`;
    const text = feld ? (feld instanceof HTMLSelectElement ? (feld.selectedOptions[0]?.text ?? "") : feld.value || feld.placeholder) : (zelle.innerText ?? "");
    const zs = getComputedStyle(zelle);
    const rand = (s: CSSStyleDeclaration) => parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
    const zusatz = rand(zs) + (feld ? rand(stil) + (feld instanceof HTMLSelectElement ? 22 : 0) : 0);
    breiten.push(leinwand.measureText(text.trim()).width * (stil.textTransform === "uppercase" ? 1.12 : 1) + zusatz);
  }
  return breiten;
}
