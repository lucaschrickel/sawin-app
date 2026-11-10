import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ANMELDE_GRUENDE } from "@/lib/auth/konstanten";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { AnmeldeFormular, Kopf } from "../formulare";
import Laden from "../loading";

export const metadata: Metadata = { title: "Anmelden" };

/** Kopf sofort; Sitzung (Cookies) und Formular hinter Suspense, damit die Seite nicht blockiert (Cache Components). */
export default function AnmeldenPage({ searchParams }: PageProps<"/anmelden">) {
  return (
    <>
      <Kopf titel="Anmelden" text="Mit der E-Mail-Adresse aus deiner Einladung." />
      <Suspense fallback={<Laden />}>
        <Anmeldung searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Anmeldung({ searchParams }: Pick<PageProps<"/anmelden">, "searchParams">) {
  const { grund } = await searchParams;
  const stand = await anmeldeStand();
  if (stand.angemeldet && stand.aal === "aal2") redirect("/");
  return <AnmeldeFormular hinweis={typeof grund === "string" ? ANMELDE_GRUENDE[grund] : undefined} />;
}
