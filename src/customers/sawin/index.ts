import type { CustomerConfig } from "../types";
import { SawinLogo } from "./logo";
import { SAWIN_LOGO } from "./logo-pfade";

export const sawin: CustomerConfig = {
  id: "sawin",
  name: "Sawin Bauelemente",
  Logo: SawinLogo,
  logoPfade: SAWIN_LOGO,
  locale: "de-DE",
  produkte: ["Haustür", "Fenster", "Garagentor", "Rollläden", "Insektenschutz"],
  checklisten: {
    Haustür: ["Alte Tür demontiert und entsorgt", "Tür gesetzt, ausgerichtet und verankert", "Abdichtung und Anschluss innen/außen", "Funktionstest Schloss mit Kunde"],
    Fenster: ["Altfenster demontiert und entsorgt", "Fenster gesetzt und ausgerichtet", "Abdichtung (RAL-Montage) erledigt", "Funktionstest und Einweisung Kunde"],
    Garagentor: ["Alttor demontiert und entsorgt", "Zarge und Laufschienen montiert", "Antrieb montiert und eingelernt", "Funktionstest mit Kunde, Handsender übergeben"],
    Rollläden: ["Kasten und Führungsschienen montiert", "Motor angeschlossen und Endlagen eingestellt", "Funktionstest mit Kunde"],
    Insektenschutz: ["Maße vor Ort geprüft", "Spannrahmen eingesetzt", "Sitz und Funktion geprüft"],
  },
  aufmass: {
    elemente: ["Fenster", "Haustür", "Seitenteil", "Hebe-Schiebe-Tür", "Garagentor", "Rollladen", "Insektenschutz", "Sonstiges"],
    anschlag: ["DIN links", "DIN rechts", "Stulp", "Fest"],
    artikel: {
      Fenster: "Kunststofffenster 3-fach verglast",
      Haustür: "Haustür Aluminium",
      Seitenteil: "Seitenteil zur Haustür",
      "Hebe-Schiebe-Tür": "Hebe-Schiebe-Tür",
      Garagentor: "Sektionaltor",
      Rollladen: "Vorbau-Rollladen",
      Insektenschutz: "Insektenschutz-Spannrahmen",
    },
    zusatz: ["Montage pauschal"],
  },
  herkunft: ["Website", "Google", "Empfehlung", "Instagram", "Persönliches Netzwerk", "Direktansprache", "Sonstiges"],
  herkunftOnline: ["Website", "Google", "Instagram"],
  // Sonderkomponenten: hier Basis-Bausteine gezielt ersetzen, z. B.
  // overrides: { PipelineCard: SawinPipelineCard },
  overrides: {},
};
