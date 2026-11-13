import type { ReactNode } from "react";
import { UmgesetztVon } from "@/components/app/umgesetzt-von";
import { getCustomer } from "@/customers";

/** Rahmen der Anmeldeseiten: dunkles Theme mit dem ganzen Logo des Kunden (Konturen weiß über --logo-ink). */
export default function AnmeldungLayout({ children }: { children: ReactNode }) {
  const c = getCustomer();
  const { Logo } = c;
  return (
    <div data-theme="dark" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-[420px]">
        <div className="mx-auto mb-8 w-[260px] max-w-full" data-logo>
          <Logo className="block w-full" />
        </div>
        <main className="rounded-lg border border-line bg-surface p-7 shadow-pop max-sm:p-5">{children}</main>
        <p className="mt-6 text-center text-xs text-muted">Zugang nur für Mitarbeiter von {c.name} · Anmeldung mit zweitem Faktor</p>
        <UmgesetztVon className="mt-10 opacity-90" />
      </div>
    </div>
  );
}
