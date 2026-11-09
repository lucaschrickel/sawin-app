import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeAdmin, type Benutzer } from "@/lib/auth/sitzung";
import { createAdminClient } from "@/lib/supabase/admin";
import { BenutzerTabelle, EinladenDialog, type Zeile } from "./ui";

export const metadata: Metadata = { title: "Benutzer" };

export default async function BenutzerPage() {
  const { supabase, benutzer: ich } = await pruefeAdmin();
  const { data: liste } = await supabase
    .from("benutzer")
    .select("id, name, email, admin, konditionen, aktiv, dashboard_start")
    .order("name")
    .returns<Benutzer[]>();

  // Anmeldestatus und zweiter Faktor kommen aus Supabase Auth (nur nach Admin-Prüfung)
  const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const info = new Map(
    (auth?.users ?? []).map((u) => [
      u.id,
      { angemeldet: !!u.last_sign_in_at, zweiFaktor: (u.factors ?? []).some((f) => f.status === "verified") },
    ]),
  );
  const zeilen: Zeile[] = (liste ?? []).map((b) => ({ ...b, ...(info.get(b.id) ?? { angemeldet: false, zweiFaktor: false }) }));

  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Benutzer" }]}>
      <PageHeader
        title="Benutzer"
        sub="Anmeldung nur per Einladung, mit Zwei-Faktor-Anmeldung. Rechte: Admin und „Konditionen sehen“."
        actions={<EinladenDialog />}
      />
      <BenutzerTabelle zeilen={zeilen} ichId={ich.id} />
    </Shell>
  );
}
