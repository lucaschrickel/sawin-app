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
  herkunft: ["Website", "Google", "Empfehlung", "Instagram", "Persönliches Netzwerk", "Direktansprache", "Sonstiges"],
  herkunftOnline: ["Website", "Google", "Instagram"],
  // Sonderkomponenten: hier Basis-Bausteine gezielt ersetzen, z. B.
  // overrides: { PipelineCard: SawinPipelineCard },
  overrides: {},
};
