import type { ReactNode } from "react";
import { getCustomer } from "@/customers";

/** Rahmen der Anmeldeseiten: dunkles Theme mit Logo und Wortmarke des Kunden. */
export default function AnmeldungLayout({ children }: { children: ReactNode }) {
  const c = getCustomer();
  const { Logo } = c;
  return (
    <div data-theme="dark" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-center gap-4">
          <span className="w-[64px] shrink-0">
            <Logo gap="var(--canvas)" className="w-full" />
          </span>
          <span>
            <b className="block text-[26px] leading-none font-bold tracking-[0.16em] text-accent">{c.brandWordmark}</b>
            {c.brandTagline && (
              <small className="mt-1.5 block border-t border-line-strong pt-1.5 text-[12px] tracking-[0.32em] text-muted uppercase">
                {c.brandTagline}
              </small>
            )}
          </span>
        </div>
        <main className="rounded-lg border border-line bg-surface p-7 shadow-pop max-sm:p-5">{children}</main>
        <p className="mt-6 text-center text-xs text-muted">Zugang nur für Mitarbeiter von {c.name} · Anmeldung mit zweitem Faktor</p>
      </div>
    </div>
  );
}
