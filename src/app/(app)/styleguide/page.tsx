import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { BalkenListe, DashKarte, HinweisZeile, Platzhalter, Ring, RingKarte } from "@/components/app/dashboard-bausteine";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { PipelineCard, type PipelineCardProps } from "@/components/app/pipeline-card";
import { Shell } from "@/components/app/shell";
import { Badge, Tag, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, PasswortInput } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getCustomer, resolveSlot } from "@/customers";
import { eur } from "@/lib/format";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON, AUFTRAG_PHASEN, BELEG_STATUS_TONE } from "@/lib/status";
import { AblageUploadDemo, BestaetigenDemo, ChatDemo, DialogDemo, FarbWahlDemo, FormDemo, FormularDialogDemo, RichTextDemo } from "./demo-interactive";
import { TrefferZeile } from "@/components/app/kopfzeile";
import { Pfad, ZurueckKnopf } from "@/components/app/verlauf";
import { FORMULAR_STATUS_TEXT, FORMULAR_STATUS_TON, type FormularStatus } from "@/lib/formular-logik";
import type { Treffer } from "@/lib/such-typen";
import { ChatZahl } from "../chat/ui";

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
  { cls: "font-mono text-[13px] font-medium", label: "Mono · 13 / 500", sample: "AG1260385 · 26-0142 · 07:30" },
];

const TREFFER: Treffer[] = [
  { bereich: "beleg", id: "t1", nummer: "AG1260432", titel: "Haustür RC2", details: "Angebot · Familie Weiß · Ringstraße 1", betrag: 4890, status: "Offen", fundstelle: "Position", fundtext: "Haustür Aluminium RC2, Sicherheitsbeschlag", href: "#" },
  { bereich: "termin", id: "t2", nummer: null, titel: "Beratung Fenster", details: "Beratung · 12.11.2026 10:00–11:00 · Ausstellung", betrag: null, status: null, fundstelle: "Titel", fundtext: null, href: "#" },
  { bereich: "lieferant", id: "t3", nummer: "K-4711", titel: "Fensterbau Nord", details: "Fenster, Haustür · 6 Wochen", betrag: null, status: null, fundstelle: "Ansprechpartner", fundtext: "Frau Kruse · Vertrieb · 0511 123456", href: "#" },
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
  const { Logo } = getCustomer();

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

        <Section title="Planungspalette" description="Einsätze in den Plantafeln (--plan-1 bis --plan-10), Text in --ink · plan-1 Auftrag, plan-5 Reklamation">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="rounded-md px-3 py-2 text-sm font-medium text-ink" style={{ background: `var(--plan-${i + 1})` }}>
                plan-{i + 1}
              </span>
            ))}
            <span className="rounded-md border-2 border-dashed border-(--plan-1) bg-surface px-3 py-2 text-sm text-ink-3">vorgeplant</span>
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
              {AUFTRAG_PHASEN.map((s) => (
                <Badge key={s} tone={AUFTRAG_PHASE_TON[s]} dot>
                  {AUFTRAG_PHASE_TEXT[s]}
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

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          <Platzhalter titel="Offene Forderungen" />
          <DashKarte titel="Balkenliste" mehr={{ href: "#", text: "Alle" }}>
            <BalkenListe zeilen={[{ name: "Website", titel: "Website", n: 12, zusatz: "40 %" }, { name: "Empfehlung", titel: "Empfehlung", n: 9, zusatz: "30 %" }, { name: "Google", titel: "Google", n: 5, zusatz: "17 %" }]} />
          </DashKarte>
          <DashKarte titel="Braucht Aufmerksamkeit">
            <HinweisZeile href="#" titel="2 Abwesenheiten zur Genehmigung" info="Vitali ab 16.11. · Jannis ab 23.11." ton="amber" />
            <HinweisZeile href="#" titel="1 Bestellung überfällig" info="BE-26-004 Fensterwerk" ton="red" />
          </DashKarte>
        </div>
        <div className="flex flex-wrap gap-4">
          <RingKarte dunkel href="#" titel="Abwesenheiten" text="1 Antrag wartet auf Genehmigung · heute 90 % des Teams da" ring={<Ring dunkel prozent={90} zahl={1} titel="90 % anwesend" />} />
          <RingKarte href="#" titel="Einsätze heute" text="Team Vitali, Jannis · nächste 14 Tage zu 75 % freigegeben" ring={<Ring prozent={75} zahl={2} titel="75 % freigegeben" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Section title="Formular" description="Felder mit Beschriftung, Hinweis und Fehlerzustand">
            <FormDemo />
            <div className="mt-8">
              <RichTextDemo />
            </div>
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
                  <Td className="font-mono text-[13px]">{nr}</Td>
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

        <Section title="Formular-Dialog" description="Dialog mit Formular, fragt beim Schließen mit ungespeicherten Änderungen nach (FormularDialog) · Formulare über den Baustein Formular, der Eingaben bei einem Fehler vom Server behält">
          <FormularDialogDemo />
        </Section>

        <Section title="Bestätigung" description="Nur vor endgültigen oder destruktiven Schritten (Baustein Bestaetigen)">
          <BestaetigenDemo />
        </Section>

        <Section title="Logo" description="Aus dem Kunden-Ordner (variante voll oder symbol) · Konturen und Wortmarke über das Token --logo-ink: anthrazit auf hellem, weiß auf dunklem Grund">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-center rounded-lg border border-line bg-surface p-6">
              <Logo className="block w-[220px]" />
            </div>
            <div className="flex items-center justify-center gap-5 rounded-lg bg-frame p-6 [--logo-ink:var(--frame-logo-ink)]">
              <Logo className="block w-[178px]" />
              <Logo variante="symbol" className="block w-[40px]" />
            </div>
            <div data-theme="dark" className="flex items-center justify-center rounded-lg bg-canvas p-6">
              <Logo className="block w-[220px]" />
            </div>
          </div>
        </Section>

        <Section title="Zurück oben links" description="Verlauf je Browser-Tab (Komponente Verlauf): vorherige Maske als Knopf, nach der Seitenleiste nur der Name, direkt per Link geöffnet der fachliche Pfad">
          <div className="flex flex-col gap-3">
            <ZurueckKnopf href="/styleguide" titel="Aufträge" />
            <Pfad crumbs={[{ label: "Belege" }, { label: "Aufträge" }]} nurName />
            <Pfad crumbs={[{ label: "Belege" }, { label: "Aufträge", href: "/auftraege" }, { label: "AB2260227 · Familie Weiß" }]} />
          </div>
        </Section>

        <Section title="Suche: Treffer" description="Vorschlag der globalen Suche mit Fundstelle und hervorgehobenem Begriff (TrefferZeile)">
          <div className="flex max-w-xl flex-col gap-1 rounded-md border border-line-soft bg-surface p-1.5">
            {TREFFER.map((t) => (
              <TrefferZeile key={t.id} t={t} q="RC2" />
            ))}
          </div>
        </Section>

        <Section title="Farbwahl (Plantafel)" description="Standard nach Typ, Planungspalette oder frei gewählt; bei freier Farbe Schrift automatisch hell oder dunkel">
          <FarbWahlDemo />
        </Section>

        <Section title="Ablage (OneDrive)" description="Upload in den Unterordner des Vorgangs (AblageUpload); große Dateien gehen direkt in den Zwischenspeicher">
          <div className="max-w-xl">
            <AblageUploadDemo />
          </div>
        </Section>

        <Section title="Formulare & Chat" description="Status der Formulare (Aufmaß: Entwurf, Abgeschlossen; Protokolle: Gedruckt, Scan abgelegt) und Zahl ungelesener Nachrichten (ChatZahl)">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(FORMULAR_STATUS_TEXT) as FormularStatus[]).map((st) => (
              <Badge key={st} tone={FORMULAR_STATUS_TON[st]}>{FORMULAR_STATUS_TEXT[st]}</Badge>
            ))}
            <span className="ml-4 inline-flex items-center gap-1.5 text-sm">Chat <ChatZahl n={3} /></span>
          </div>
        </Section>

        <Section title="Chat" description="Nachrichten je Auftrag bzw. Ticket mit @Erwähnung und Foto (ChatPanel) · hier ohne echten Vorgang">
          <div className="max-w-3xl">
            <ChatDemo />
          </div>
        </Section>

        <Section title="Dunkles Theme" description="Einstellungen › Darstellung setzt data-theme=&quot;dark&quot; auf &lt;html&gt; (Hell, Dunkel, wie das System); die Anmeldeseite setzt es auf einem umschließenden Element">
          <div data-theme="dark" className="rounded-lg bg-canvas p-6 text-ink">
            <div className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-6">
              <div>
                <div className="text-lg font-semibold">Anmelden</div>
                <p className="mt-1 text-sm text-muted">Mit der E-Mail-Adresse aus Ihrer Einladung</p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-3">
                E-Mail
                <Input type="email" placeholder="name@firma.de" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-3">
                Passwort
                <PasswortInput defaultValue="geheim-Beispiel1" autoComplete="off" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">Angenommen</Badge>
                <Badge tone="amber">Bald fällig</Badge>
                <Badge tone="red">Überfällig</Badge>
                <Badge tone="brand">Montage</Badge>
              </div>
              <Button variant="accent">Weiter</Button>
            </div>
          </div>
        </Section>
      </div>
    </Shell>
  );
}
