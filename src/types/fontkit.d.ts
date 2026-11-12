// Minimale Typen für fontkit (nur das, was die PDFs zum Messen von Text brauchen)
declare module "fontkit" {
  export type Font = { unitsPerEm: number; layout(text: string): { advanceWidth: number } };
  export function openSync(pfad: string): Font;
}
