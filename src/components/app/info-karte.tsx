import type { ReactNode } from "react";

/** Karte mit Überschrift und optionalem Element rechts (z. B. Anzahl oder Status) für Detailseiten. */
export function Karte({ titel, rechts, children }: { titel: string; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{titel}</h2>
        {rechts}
      </div>
      {children}
    </section>
  );
}

/** Beschriftete Angabe in einer Karte (innerhalb von <dl>). */
export function Angabe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-2">{name}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
