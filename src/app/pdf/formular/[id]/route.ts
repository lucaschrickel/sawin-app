import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { formularDateiname } from "@/lib/formular-logik";
import { ladeFormularDruck } from "@/lib/formulare";
import { formularPdf } from "@/lib/pdf/formular-pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PDF eines Formulars: Aufmaßblatt (im Entwurf mit Wasserzeichen) bzw. Vorlage eines Protokolls zum Ausdrucken.
 * Immer frisch aus den Daten erzeugt; nur angemeldete Benutzer, gelesen mit den Rechten des Benutzers (RLS).
 */
export async function GET(request: Request, ctx: RouteContext<"/pdf/formular/[id]">) {
  await pruefeSitzung();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Formular nicht gefunden", { status: 404 });
  const d = await ladeFormularDruck(id);
  if (!d) return new Response("Formular nicht gefunden", { status: 404 });
  const pdf = await formularPdf(d, getCustomer().logoPfade);
  const name = formularDateiname(d.formular.typ, d.formular.bezug.nummer, d.formular.kunde?.name ?? null);
  const art = new URL(request.url).searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${art}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
