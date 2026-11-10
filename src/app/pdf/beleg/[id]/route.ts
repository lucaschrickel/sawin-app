import { druckDaten, erzeugePdf, pdfAblegen, pdfLaden } from "@/lib/beleg-ablage";
import { ladeBeleg } from "@/lib/belege";
import { LEXWARE_BELEGARTEN } from "@/lib/belege-status";
import { lexwarePdfNachladen } from "@/lib/lexware/uebertragung";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { pdfDateiname } from "@/lib/pdf/beleg-pdf";

/**
 * PDF eines Belegs. Entwurf: frisch erzeugt mit Wasserzeichen „ENTWURF“. Fertiggestellt: das abgelegte Original
 * (fehlt es, wird es erzeugt und abgelegt). Rechnung, Abschlag, Gutschrift: das Original-PDF von Lexware (fehlt es,
 * wird es bei Lexware abgeholt; bis dahin die App-Vorschau mit Wasserzeichen „ENTWURF“, die nie versendet wird). ?version=n: eingefrorene Version. ?download=1: als Datei speichern.
 */
export async function GET(request: Request, ctx: RouteContext<"/pdf/beleg/[id]">) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const d = await ladeBeleg(id);
  if (!d) return new Response("Beleg nicht gefunden", { status: 404 });

  let pdf: Buffer | null = null;
  let name = pdfDateiname(d.beleg);
  const version = Number(url.searchParams.get("version"));
  if (version && version !== d.beleg.version) {
    const v = d.versionen.find((x) => x.version === version);
    if (!v?.pdf_pfad) return new Response("Version nicht gefunden", { status: 404 });
    pdf = await pdfLaden(v.pdf_pfad);
    name = pdfDateiname({ ...d.beleg, version });
  } else if (d.beleg.status === "entwurf") {
    pdf = await erzeugePdf(druckDaten(d), true);
  } else if (LEXWARE_BELEGARTEN.includes(d.beleg.art)) {
    if (d.beleg.pdf_pfad) pdf = await pdfLaden(d.beleg.pdf_pfad);
    if (!pdf && d.beleg.lexware_id) {
      try {
        const pfad = await lexwarePdfNachladen(d);
        if (pfad) pdf = await pdfLaden(pfad);
      } catch {
        // Lexware gerade nicht erreichbar: Vorschau der App mit Wasserzeichen
      }
    }
    if (!pdf) pdf = await erzeugePdf(druckDaten(d), true);
  } else {
    if (d.beleg.pdf_pfad) pdf = await pdfLaden(d.beleg.pdf_pfad);
    if (!pdf) {
      await pruefeSitzung();
      const pfad = await pdfAblegen(d);
      pdf = await pdfLaden(pfad);
    }
  }
  if (!pdf) return new Response("PDF nicht verfügbar", { status: 404 });
  const art = url.searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${art}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
