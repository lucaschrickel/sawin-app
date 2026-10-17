import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { PipelineCard, type PipelineCardProps } from "@/components/app/pipeline-card";
import { Shell } from "@/components/app/shell";
import { Badge, Tag, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { resolveSlot } from "@/customers";
import { eur } from "@/lib/format";
import { AUFTRAG_STATUS, AUFTRAG_TONE, BELEG_STATUS_TONE } from "@/lib/status";
import { DialogDemo, FormDemo } from "./demo-interactive";

export const metadata: Metadata = { title: "Designsystem" };

const SWATCHES: { name: string; token: string; note: string }[] = [
  { name: "Anthrazit", token: "--frame", note: "Seitenleiste, Primär-Button" },
  { name: "Akzent", token: "--accent", note: "Nur Flächen, nie Text" },
  { name: "Akzent hell", token: "--accent-soft", note: "Hinterlegte Bereiche" },
  { name: "Akzent-Text", token: "--accent-text", note: "Links, Text in Sand-Optik" },
  { name: "Hintergrund", token: "--canvas", note: "Inhaltsfläche" },
  { name: "Fläche", token: "--surface", note: "Karten, Felder" },
  { name: "Linie", token: "--line", note: "Rahmen, Trenner" },
  { name: "Text gedämpft", token: "--muted-2", note: "Hinweise, Tabellenköpfe" },
];

const TYPE: { cls: string; label: string; sample: string }[] = [
  { cls: "text-4xl font-bold tracking-[-0.02em]", label: "Seitentitel · 30 / 700", sample: "Aufträge" },
  { cls: "text-[26px] font-bold tracking-[-0.02em] tabular", label: "Kennzahl · 26 / 700", sample: "184.230 €" },
  { cls: "text-lg font-semibold", label: "Kartentitel · 16,5 / 600", sample: "Bestellung & Lieferung" },
  { cls: "text-base", label: "Fließtext · 14 / 400", sample: "Haustür mit Seitenteil und 4 Fenster" },
  { cls: "text-sm text-muted", label: "Nebentext · 13 / 400", sample: "Grüner Weg 17, 38524 Sassenburg" },
  { cls: "text-xs font-medium text-muted-2", label: "Beschriftung · 12 / 500", sample: "Auftragswert (aus AB, brutto)" },
];

const DEMO_CARDS: PipelineCardProps[] = [
  {
    href: "#",
    auftragId: "26-0142",
    kunde: "Familie Berger",
    titel: "Haustür mit Seitenteil und 4 Fenster",
    wert: 17993.3,
    produkte: ["Haustür", "Fenster"],
    hinweis: { text: "Teilweise bestellt · Lieferung KW 45", tone: "amber" },
    warnung: "Noch nicht alles bestellt",
    kette: [
      { kurz: "AG", name: "Angebot", vorhanden: true },
      { kurz: "AB", name: "Auftragsbestätigung", vorhanden: true },
      { kurz: "LS", name: "Lieferschein", vorhanden: false },
      { kurz: "RE", name: "Rechnung", vorhanden: true },
    ],
    team: [
      { initials: "MK", name: "Marek Kowalski" },
      { initials: "TB", name: "Tobias Brandt" },
    ],
  },
  {
    href: "#",
    auftragId: "26-0151",
    kunde: "Familie Brandes",
    titel: "6 Fenster mit Insektenschutz",
    wert: 12820,
    produkte: ["Fenster", "Insektenschutz"],
    hinweis: { text: "Angebot gesendet", tone: "gray" },
    kette: [
      { kurz: "AG", name: "Angebot", vorhanden: true },
      { kurz: "AB", name: "Auftragsbestätigung", vorhanden: false },
      { kurz: "LS", name: "Lieferschein", vorhanden: false },
      { kurz: "RE", name: "Rechnung", vorhanden: false },
    ],
    team: [{ initials: "JS", name: "Jannis Sawin" }],
  },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function StyleguidePage() {
  // Kunden können die Pipeline-Karte per Slot ersetzen, ohne den Basiscode zu ändern.
  const Card_ = resolveSlot("PipelineCard", PipelineCard);

  return (
    <Shell active="styleguide" crumbs={[{ label: "System" }, { label: "Designsystem" }]}>
      <PageHeader
        title="Designsystem"
        sub="Alle Bausteine der App an einem Ort · Farben und Logo kommen aus dem Kunden-Theme"
        actions={
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Neuer Auftrag
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <Section title="Farben" description="Werte aus src/styles/tokens.css und src/customers/sawin/theme.css">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {SWATCHES.map((s) => (
              <div key={s.token} className="overflow-hidden rounded-md border border-line">
                <div className="h-16" style={{ background: `var(${s.token})` }} />
                <div className="px-3 py-2.5">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <code className="text-xs text-muted-2">{s.token}</code>
                  <div className="mt-1 text-xs text-muted">{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typografie" description="Inter, lokal eingebunden · Zahlen mit festen Ziffernbreiten (tabular)">
          <div className="flex flex-col divide-y divide-line-soft">
            {TYPE.map((t) => (
              <div key={t.label} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
                <span className="w-56 shrink-0 text-xs text-muted-2">{t.label}</span>
                <span className={t.cls}>{t.sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons" description="Primär für die Hauptaktion je Ansicht, Akzent für „Neu“">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary">Speichern</Button>
            <Button variant="accent">
              <Plus className="size-[15px]" strokeWidth={2.2} />
              Neu
            </Button>
            <Button>Bearbeiten</Button>
            <Button variant="ghost">Abbrechen</Button>
            <Button variant="danger">Löschen</Button>
            <Button disabled>Deaktiviert</Button>
            <Button size="sm">Klein</Button>
            <Button size="xs">Sehr klein</Button>
          </div>
        </Section>

        <Section title="Status" description="Auftragsstatus mit Punkt, Belegstatus ohne Punkt">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {AUFTRAG_STATUS.map((s) => (
                <Badge key={s} tone={AUFTRAG_TONE[s]} dot>
                  {s}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(BELEG_STATUS_TONE).map(([s, tone]) => (
                <Badge key={s} tone={tone as Tone}>
                  {s}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Haustür", "Fenster", "Garagentor", "Rollläden", "Insektenschutz"].map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </div>
          </div>
        </Section>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
          <KpiCard label="Offene Anfragen" value="12" note="↗ 4 neu diese Woche" spark={[3, 5, 2, 4, 6, 4]} href="#" />
          <KpiCard label="Auftragsbestand brutto" value="184.230 €" note="11 offene Aufträge" spark={[27, 39, 44, 41, 36, 47]} />
          <KpiCard label="Offene Forderungen" value="23.410 €" note="2 überfällig" spark={[8, 4, 12, 6, 9, 5]} />
          <KpiCard label="Montagen 14 Tage" value="6" note="Nächste morgen 07:30" spark={[2, 3, 1, 2, 3, 1]} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Section title="Formular" description="Felder mit Beschriftung, Hinweis und Fehlerzustand">
            <FormDemo />
          </Section>
          <Section title="Pipeline-Karten" description="Ersetzbar je Kunde über den Slot „PipelineCard“">
            <div className="flex flex-col gap-2.5 rounded-[20px] bg-surface-sunken p-3">
              {DEMO_CARDS.map((c) => (
                <Card_ key={c.auftragId} {...c} />
              ))}
            </div>
          </Section>
        </div>

        <Section title="Tabelle">
          <Table className="min-w-[640px]">
            <thead>
              <tr>
                <Th>Nummer</Th>
                <Th>Art</Th>
                <Th>Kunde</Th>
                <Th className="text-right">Brutto</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ["AG1260385", "Angebot", "Familie Berger", 17993.3, "Angenommen"],
                ["AB1260205", "Auftragsbestätigung", "Familie Berger", 17993.3, "Offen"],
                ["RE1260080", "1. Abschlagsrechnung", "Familie Berger", 5397.99, "Bezahlt"],
                ["RE1260083", "Abschlagsrechnung", "Autohaus Lüdtke", 1733.64, "Überfällig"],
              ].map(([nr, art, kunde, betrag, status]) => (
                <Tr key={nr as string}>
                  <Td className="tabular">{nr}</Td>
                  <Td>{art}</Td>
                  <Td>{kunde}</Td>
                  <Td className="tabular text-right">{eur(betrag as number)}</Td>
                  <Td>
                    <Badge tone={BELEG_STATUS_TONE[status as string]}>{status}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Dialog" description="Für Bestätigungen und Formulare · auf dem Handy bildschirmfüllend">
          <DialogDemo />
        </Section>
      </div>
    </Shell>
  );
}
