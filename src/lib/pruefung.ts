import type { Tone } from "@/components/ui/badge";

/** Prüftermine eines Fahrzeugs wie in der Demo: TÜV/HU, Service, UVV-Prüfung */
export const PRUEFTERMINE = [
  ["tuev_am", "TÜV / HU"],
  ["service_am", "Service"],
  ["uvv_am", "UVV-Prüfung"],
] as const;

/** Ampel: überfällig (rot), in 30 Tagen fällig (gelb), sonst neutral */
export function pruefAmpel(datum: string | null, heute: string): { text: string; ton: Tone; tage: number } | null {
  if (!datum) return null;
  const tage = Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / 864e5);
  const d = datum.split("-").reverse().join(".");
  if (tage < 0) return { text: `${d} · überfällig`, ton: "red", tage };
  if (tage <= 30) return { text: `${d} · in ${tage} ${tage === 1 ? "Tag" : "Tagen"}`, ton: "amber", tage };
  return { text: d, ton: "gray", tage };
}
