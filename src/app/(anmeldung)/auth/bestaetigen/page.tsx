import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { linkEinloesen } from "@/lib/auth/aktionen";
import { Kopf, Meldung } from "../../formulare";

export const metadata: Metadata = { title: "Link bestätigen" };

/**
 * Ziel der Links aus Einladung und „Passwort vergessen“. Der Link wird erst per Knopf eingelöst, damit
 * Link-Prüfungen von E-Mail-Programmen (z. B. Microsoft Defender) ihn nicht vorab verbrauchen.
 */
export default async function LinkBestaetigenPage({ searchParams }: PageProps<"/auth/bestaetigen">) {
  const { token_hash: tokenHash, type } = await searchParams;
  const gueltig = typeof tokenHash === "string" && (type === "invite" || type === "recovery");
  return (
    <>
      <Kopf titel={type === "invite" ? "Einladung annehmen" : "Neues Passwort"} />
      {gueltig ? (
        <form action={linkEinloesen} className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            {type === "invite"
              ? "Im nächsten Schritt legst du dein Passwort fest und richtest die Zwei-Faktor-Anmeldung ein."
              : "Im nächsten Schritt bestätigst du deinen Code und legst ein neues Passwort fest."}
          </p>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <Button type="submit" variant="accent">Weiter</Button>
        </form>
      ) : (
        <Meldung art="fehler">Der Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen.</Meldung>
      )}
    </>
  );
}
