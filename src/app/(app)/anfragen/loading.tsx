import { ListePlatzhalter } from "@/components/app/platzhalter";

/** Lade-Platzhalter im Aufbau der Seite (Seitenleiste und Kopfzeile bleiben stehen) */
export default function Laden() {
  return <ListePlatzhalter chips={5} spalten={6} aktionen={2} />;
}
