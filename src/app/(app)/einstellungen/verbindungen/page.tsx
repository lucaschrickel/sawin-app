import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { lexware, lexwareEingerichtet } from "@/lib/lexware/client";
import { offeneAnzahl } from "@/lib/onedrive/ablage";
import { graphEingerichtet } from "@/lib/onedrive/graph";
import { zeitpunkt } from "@/lib/zeit";
import { EinstellungenReiter } from "../reiter";
import { BccFormular, NachladenKnopf, OneDriveFormular } from "./ui";

export const metadata: Metadata = { title: "Verbindungen · Einstellungen" };

const karte = "max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4";

/** Einstellungen › Verbindungen: Lexware, OneDrive (Ablage), E-Mail (Version 2) und interne Kopie je Belegart */
export default async function VerbindungenPage() {
  const { benutzer, supabase } = await pruefeSitzung();
  const [{ data: e }, { data: bcc }, offen, konto] = await Promise.all([
    supabase.from("einstellung").select("onedrive_site_id, onedrive_liste_id, onedrive_basis_pfad, onedrive_basis_url, onedrive_geprueft_am, onedrive_basis_id").maybeSingle(),
    supabase.from("belegart_einstellung").select("belegart, bcc_email"),
    offeneAnzahl(),
    lexwareEingerichtet()
      ? lexware<{ companyName?: string }>("GET", "/v1/profile")
          .then((p) => p.companyName ?? "verbunden")
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const ms = graphEingerichtet();
  const verbunden = ms && !!e?.onedrive_basis_id;
  const fehlend = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_TOKEN_SCHLUESSEL"].filter((n) => !process.env[n]?.trim());

  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Verbindungen" }]}>
      <PageHeader title="Verbindungen" sub="Lexware, OneDrive-Ablage und E-Mail" />
      <EinstellungenReiter aktiv="verbindungen" admin={benutzer.admin} />

      <section className={karte} data-verbindung="lexware">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Lexware Office</h2>
          <Badge tone={konto ? "green" : lexwareEingerichtet() ? "amber" : "gray"}>{konto ? "verbunden" : lexwareEingerichtet() ? "nicht erreichbar" : "nicht eingerichtet"}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {konto ? <>Konto: <b className="text-ink">{konto}</b>. </> : null}
          Rechnungen, Abschläge und Gutschriften entstehen in Lexware; der Zahlungsstand kommt per Webhook und Cron. Der API-Schlüssel steht nur auf dem Server (<code>LEXWARE_API_KEY</code>).
        </p>
      </section>

      <section className={`${karte} mt-4`} data-verbindung="onedrive">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">OneDrive (SharePoint)</h2>
          <Badge tone={verbunden ? "green" : ms ? "amber" : "gray"} data-onedrive-status={verbunden ? "verbunden" : ms ? "offen" : "fehlt"}>
            {verbunden ? "verbunden" : ms ? "Bibliothek wählen" : "nicht eingerichtet"}
          </Badge>
        </div>
        <p className="mt-1 mb-4 text-sm text-muted">
          Ablage der Beleg-PDFs, Scans und Dateien in den Vorgangsordnern. Die App meldet sich als Anwendung an und hat nur Zugriff auf die eine freigegebene Bibliothek, keine Mailrechte.
          {!ms && <> Auf dem Server fehlen: <code>{fehlend.join(", ")}</code> (siehe docs/uebergabe.md).</>}
        </p>
        {verbunden && (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            Basisordner:{" "}
            {e?.onedrive_basis_url ? (
              <a href={e.onedrive_basis_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                {e.onedrive_basis_pfad} <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <b>{e?.onedrive_basis_pfad}</b>
            )}
            {e?.onedrive_geprueft_am && <span className="text-muted-2">· geprüft {zeitpunkt(e.onedrive_geprueft_am)}</span>}
          </p>
        )}
        <OneDriveFormular admin={benutzer.admin} eingerichtet={ms} start={{ site_id: e?.onedrive_site_id ?? "", liste_id: e?.onedrive_liste_id ?? "", basis_pfad: e?.onedrive_basis_pfad ?? "" }} />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-line-soft pt-3">
          <p className="text-sm text-muted" data-zwischenspeicher={offen}>
            Zwischenspeicher: <b className="text-ink">{offen === 1 ? "1 Datei wartet" : `${offen} Dateien warten`}</b> auf die Übertragung (automatisch alle 30 Minuten und beim Öffnen eines Auftrags).
          </p>
          {verbunden && <NachladenKnopf offen={offen} />}
        </div>
      </section>

      <section className={`${karte} mt-4`} data-verbindung="email">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">E-Mail</h2>
          <Badge tone="gray">kommt mit Version 2</Badge>
        </div>
        <p className="mt-1 mb-4 text-sm text-muted">Bis dahin: „Versenden“ öffnet Outlook mit Empfänger, Betreff und Text; das PDF fügt das Büro selbst an. Die interne Kopie (BCC) je Belegart wird dabei vorbelegt.</p>
        <BccFormular admin={benutzer.admin} werte={Object.fromEntries((bcc ?? []).map((x) => [x.belegart, x.bcc_email ?? ""]))} />
      </section>
    </Shell>
  );
}
