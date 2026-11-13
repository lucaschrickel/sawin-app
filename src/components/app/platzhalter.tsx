import { cn } from "@/lib/cn";

/*
  Lade-Platzhalter (loading.tsx je Bereich): zeigen den Aufbau der Seite, nie Daten – keine Zahlen, Namen oder alten
  Werte. Seitenleiste und Kopfzeile stehen im Layout und bleiben beim Seitenwechsel stehen; die Platzhalter füllen nur den
  Inhaltsbereich. Maße wie die echten Seiten (PageHeader, Tabellenkarte, Detail mit 360-px-Spalte, Vorschau 340 px).
*/

/** Grauer Balken; pulsiert nur, wenn der Benutzer Bewegung zulässt */
export function Balken({ className }: { className?: string }) {
  return <div className={cn("rounded-sm bg-surface-sunken motion-safe:animate-pulse", className)} />;
}

/** Textzeile als Platzhalter innerhalb von Fließtext (z. B. Unterzeile im Seitenkopf) */
export function ZeilenPlatzhalter({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-4 w-80 max-w-[70vw] rounded-sm bg-surface-sunken align-middle motion-safe:animate-pulse", className)} />;
}

function Rahmen({ children, label = "Seite wird geladen" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-platzhalter>
      <span className="sr-only">{label} …</span>
      {children}
    </div>
  );
}

function Karte({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-lg border border-line-soft bg-surface p-5", className)}>{children}</div>;
}

/** Seitenkopf wie PageHeader: Titel, Unterzeile, rechts Aktionen */
export function KopfPlatzhalter({ aktionen = 1, unterzeile = true }: { aktionen?: number; unterzeile?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Balken className="h-10 w-56 rounded-md" />
        {unterzeile && <Balken className="mt-2.5 h-4 w-80 max-w-[70vw]" />}
      </div>
      {aktionen > 0 && (
        <div className="flex gap-2.5">
          {Array.from({ length: aktionen }, (_, i) => (
            <Balken key={i} className="h-[42px] w-36 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function Filterzeile({ chips = 4, suche = true }: { chips?: number; suche?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {Array.from({ length: chips }, (_, i) => (
        <Balken key={i} className="h-9 w-24 rounded-full" />
      ))}
      {suche && <Balken className="ml-auto h-10 w-72 max-w-full rounded-full" />}
    </div>
  );
}

/** Tabellenkarte mit Kopfzeile und Zeilen */
export function TabellenPlatzhalter({ zeilen = 10, spalten = 5 }: { zeilen?: number; spalten?: number }) {
  const breiten = ["w-24", "w-48", "w-32", "w-20", "w-16", "w-28", "w-24"];
  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      <div className="flex gap-6 border-b border-line-soft px-4 py-3">
        {Array.from({ length: spalten }, (_, i) => (
          <Balken key={i} className={cn("h-3", breiten[i % breiten.length], i === spalten - 1 && "ml-auto")} />
        ))}
      </div>
      {Array.from({ length: zeilen }, (_, z) => (
        <div key={z} className="flex items-center gap-6 border-b border-line-soft px-4 py-[15px] last:border-0">
          {Array.from({ length: spalten }, (_, i) => (
            <Balken key={i} className={cn("h-4", breiten[(i + z) % breiten.length], i === spalten - 1 && "ml-auto")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Übersichten (Kunden, Anfragen, Tickets, Lieferanten, Bestellungen, Mitarbeiter, Fahrzeuge, Zeiten, Aufgaben …) */
export function ListePlatzhalter({ chips = 4, spalten = 5, aktionen = 1 }: { chips?: number; spalten?: number; aktionen?: number }) {
  return (
    <Rahmen>
      <KopfPlatzhalter aktionen={aktionen} />
      <Filterzeile chips={chips} />
      <TabellenPlatzhalter spalten={spalten} />
    </Rahmen>
  );
}

/** Belegübersichten und Aufträge: Liste links, Vorschau-Leiste rechts (340 px) */
export function BelegListePlatzhalter() {
  return (
    <Rahmen>
      <KopfPlatzhalter />
      <Filterzeile chips={6} suche={false} />
      <Filterzeile chips={3} />
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <TabellenPlatzhalter zeilen={12} spalten={6} />
        <div className="hidden flex-col gap-3 rounded-lg border border-line-soft bg-surface p-4 min-[1100px]:flex">
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Balken key={i} className="size-8 rounded-full" />
            ))}
          </div>
          <Balken className="aspect-[210/297] w-full rounded-md" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Balken className="h-3.5 w-20" />
              <Balken className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </Rahmen>
  );
}

/** Detailseiten (Kunde, Anfrage, Auftrag, Ticket, Lieferant, Bestellung, Mitarbeiter): Reiter, links breit, rechts 360 px */
export function DetailPlatzhalter({ reiter = true }: { reiter?: boolean }) {
  return (
    <Rahmen>
      <KopfPlatzhalter aktionen={2} />
      {reiter && (
        <div className="mb-4 flex gap-5 border-b border-line-soft pb-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Balken key={i} className="h-4 w-24" />
          ))}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {[5, 4, 3].map((n, k) => (
            <Karte key={k}>
              <Balken className="mb-4 h-5 w-40" />
              {Array.from({ length: n }, (_, i) => (
                <Balken key={i} className={cn("mb-2.5 h-4", i % 2 ? "w-2/3" : "w-full")} />
              ))}
            </Karte>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {[4, 3].map((n, k) => (
            <Karte key={k}>
              <Balken className="mb-4 h-5 w-28" />
              {Array.from({ length: n }, (_, i) => (
                <Balken key={i} className="mb-2.5 h-4 w-full" />
              ))}
            </Karte>
          ))}
        </div>
      </div>
    </Rahmen>
  );
}

/** Dashboard: Ansichtsumschalter, Kennzahlen, Karten */
export function DashboardPlatzhalter() {
  return (
    <Rahmen>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Balken className="h-10 w-48 rounded-md" />
          <Balken className="mt-2.5 h-4 w-96 max-w-[70vw]" />
        </div>
        <Balken className="h-11 w-80 max-w-full rounded-full" />
      </div>
      <DashboardInhaltPlatzhalter nurInhalt />
    </Rahmen>
  );
}

/** Inhalt des Dashboards (Kopf steht schon da, die Kennzahlen laden noch) */
export function DashboardInhaltPlatzhalter({ nurInhalt = false }: { nurInhalt?: boolean }) {
  const inhalt = (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Karte key={i} className="h-[150px]">
            <Balken className="h-3.5 w-28" />
            <Balken className="mt-4 h-8 w-32" />
            <Balken className="mt-4 h-3.5 w-24" />
          </Karte>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Karte key={i} className="h-[360px]">
            <Balken className="h-5 w-40" />
            <Balken className="mt-5 h-8 w-24" />
          </Karte>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Karte className="h-[88px] rounded-full" />
        <Karte className="h-[88px] rounded-full" />
      </div>
    </>
  );
  return nurInhalt ? inhalt : <Rahmen label="Kennzahlen werden geladen">{inhalt}</Rahmen>;
}

/** Montage- und Service-Plan: Werkzeugleiste und Tafel mit Beschriftungsspalte */
export function PlantafelPlatzhalter() {
  return (
    <Rahmen>
      <KopfPlatzhalter aktionen={3} />
      <div className="mb-3 flex justify-end gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Balken key={i} className="h-10 w-32 rounded-full" />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
        <div className="grid grid-cols-[200px_1fr] border-b border-line-soft">
          <div className="border-r border-line-soft p-3">
            <Balken className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="border-r border-line-soft p-3 last:border-0">
                <Balken className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
        {Array.from({ length: 10 }, (_, z) => (
          <div key={z} className="grid h-12 grid-cols-[200px_1fr] border-b border-line-soft last:border-0">
            <div className="flex items-center border-r border-line-soft px-3">
              <Balken className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="border-r border-line-soft last:border-0" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Rahmen>
  );
}

/** Kalender: links Mini-Monat und Filter (260 px), rechts Monatsraster */
export function KalenderPlatzhalter() {
  return (
    <Rahmen>
      <KopfPlatzhalter aktionen={2} />
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Karte className="flex flex-col gap-3">
          <Balken className="h-48 w-full rounded-md" />
          {Array.from({ length: 6 }, (_, i) => (
            <Balken key={i} className="h-4 w-full" />
          ))}
        </Karte>
        <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => (
              <div key={i} className="h-24 border-r border-b border-line-soft p-2 [&:nth-child(7n)]:border-r-0">
                <Balken className="h-3 w-5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Rahmen>
  );
}

/** Beleg-Editor und Belegseite: Blatt links, feste Seitenleiste rechts */
export function BelegPlatzhalter() {
  return (
    <Rahmen label="Beleg wird geladen">
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_264px] min-[1440px]:grid-cols-[minmax(0,1fr)_300px]">
        <Karte className="min-h-[70vh]">
          <div className="flex justify-between gap-6">
            <div className="flex w-64 flex-col gap-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Balken key={i} className="h-4 w-full" />
              ))}
            </div>
            <div className="flex w-56 flex-col gap-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Balken key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
          <Balken className="mt-8 h-7 w-72" />
          <Balken className="mt-4 h-16 w-full" />
          <Balken className="mt-6 h-10 w-full rounded-md" />
          {Array.from({ length: 4 }, (_, i) => (
            <Balken key={i} className="mt-3 h-12 w-full" />
          ))}
          <Balken className="mt-4 h-12 w-full rounded-md" />
        </Karte>
        <Karte className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Balken key={i} className="h-[42px] w-full rounded-full" />
          ))}
          <Balken className="mt-2 h-20 w-full" />
        </Karte>
      </div>
    </Rahmen>
  );
}

/** Einstellungen: Reiter und Formular-Karten in Lesebreite */
export function EinstellungenPlatzhalter({ reiter = true, karten = [6, 4] }: { reiter?: boolean; karten?: number[] }) {
  return (
    <Rahmen>
      <KopfPlatzhalter aktionen={0} />
      {reiter && (
        <div className="mb-5 flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Balken key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      )}
      {karten.map((n, k) => (
        <Karte key={k} className="mb-4 max-w-[760px]">
          <Balken className="mb-4 h-5 w-48" />
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {Array.from({ length: n }, (_, i) => (
              <Balken key={i} className="h-[42px] w-full rounded-md" />
            ))}
          </div>
        </Karte>
      ))}
    </Rahmen>
  );
}

/**
 * Nur beim ersten Aufruf (Sitzung wird noch geprüft): Rahmen ohne Benutzerdaten – Seitenleiste mit Logo und leeren
 * Menüzeilen, leere Kopfzeile. Danach bleibt der echte Rahmen beim Seitenwechsel stehen.
 */
export function RahmenPlatzhalter({ logo }: { logo: React.ReactNode }) {
  return (
    <div className="flex min-h-screen py-3 pr-3 max-[960px]:p-0" role="status" aria-busy="true" data-platzhalter="rahmen">
      <span className="sr-only">App wird geladen …</span>
      <div className="flex w-[252px] shrink-0 flex-col gap-2 py-2.5 pr-3.5 pl-[18px] max-[960px]:hidden" aria-hidden="true">
        <div className="mb-2 border-b border-frame-line px-1 pt-1.5 pb-3.5 [--logo-ink:var(--frame-logo-ink)]">
          <span className="block w-[178px]">{logo}</span>
        </div>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="h-8 rounded-sm bg-frame-chip motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-canvas max-[960px]:rounded-none">
        <div className="h-[74px]" />
      </div>
    </div>
  );
}
