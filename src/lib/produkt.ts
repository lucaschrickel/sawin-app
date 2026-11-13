/*
  Produkt-Einstellungen: gelten für jede Kunden-Instanz und liegen deshalb nicht in src/customers/<kunde>/.
  „Umgesetzt von“ steht dezent unter der Anmeldung. Abschalten je Instanz über die Umgebungsvariable
  UMGESETZT_VON=aus (nur Server, z. B. nach der Übergabe), danach neu bereitstellen.
*/
export const UMGESETZT_VON = {
  name: "Schrickel Digital Consulting",
  /** Liegt in public/brand/ (Bildmarke „LS“, transparent, auf hellem und dunklem Grund lesbar) */
  logo: "/brand/schrickel-logo.png",
} as const;

export function umgesetztVonAnzeigen(): typeof UMGESETZT_VON | null {
  return process.env.UMGESETZT_VON?.trim().toLowerCase() === "aus" ? null : UMGESETZT_VON;
}
