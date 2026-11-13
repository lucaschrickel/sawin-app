import { EinstellungenPlatzhalter } from "@/components/app/platzhalter";

/** Lade-Platzhalter im Aufbau der Seite (Seitenleiste und Kopfzeile bleiben stehen) */
export default function Laden() {
  return <EinstellungenPlatzhalter reiter={false} karten={[3]} />;
}
