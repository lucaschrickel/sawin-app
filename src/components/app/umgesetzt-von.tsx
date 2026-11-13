import Image from "next/image";
import { cn } from "@/lib/cn";
import { umgesetztVonAnzeigen } from "@/lib/produkt";

/** Dezenter Hinweis „Umgesetzt von …“ (Anmeldeseite); abschaltbar über UMGESETZT_VON=aus */
export function UmgesetztVon({ className }: { className?: string }) {
  const u = umgesetztVonAnzeigen();
  if (!u) return null;
  return (
    <p className={cn("flex items-center justify-center gap-2 text-xs text-muted", className)} data-umgesetzt-von>
      <span>Umgesetzt von</span>
      <Image src={u.logo} alt="" width={18} height={18} className="size-[18px]" />
      <span className="font-medium text-ink-3">{u.name}</span>
    </p>
  );
}
