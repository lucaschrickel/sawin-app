import type { CustomerConfig } from "../types";
import { SawinLogo } from "./logo";

export const sawin: CustomerConfig = {
  id: "sawin",
  name: "Sawin Bauelemente",
  brandWordmark: "SAWIN",
  brandTagline: "Bauelemente",
  Logo: SawinLogo,
  locale: "de-DE",
  // Sonderkomponenten: hier Basis-Bausteine gezielt ersetzen, z. B.
  // overrides: { PipelineCard: SawinPipelineCard },
  overrides: {},
};
