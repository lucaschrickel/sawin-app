import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * „Neue Bestellung“: führt in die Bestellmaske (/bestellungen/neu), optional vorbelegt mit Lieferant bzw. Auftrag.
 * Ohne inhalt erscheint der Standardknopf; mit inhalt und className ein eigener (z. B. „Bestellen“ in Listen).
 */
export function NeueBestellung({ lieferantId, auftragId, inhalt, className, label }: { lieferantId?: string; auftragId?: string; inhalt?: ReactNode; className?: string; label?: string }) {
  const q = new URLSearchParams();
  if (lieferantId) q.set("lieferant", lieferantId);
  if (auftragId) q.set("auftrag", auftragId);
  const href = `/bestellungen/neu${q.size ? `?${q}` : ""}`;
  return (
    <Link
      href={href}
      aria-label={label}
      data-neue-bestellung
      className={className ?? buttonVariants({ variant: "primary" })}
    >
      {inhalt ?? (
        <>
          <Plus className="size-[15px]" strokeWidth={2.2} />
          Neue Bestellung
        </>
      )}
    </Link>
  );
}
