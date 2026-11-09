import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ANMELDE_GRUENDE } from "@/lib/auth/konstanten";
import { anmeldeStand } from "@/lib/auth/sitzung";
import { AnmeldeFormular, Kopf } from "../formulare";

export const metadata: Metadata = { title: "Anmelden" };

export default async function AnmeldenPage({ searchParams }: PageProps<"/anmelden">) {
  const { grund } = await searchParams;
  const stand = await anmeldeStand();
  if (stand.angemeldet && stand.aal === "aal2") redirect("/");
  return (
    <>
      <Kopf titel="Anmelden" text="Mit der E-Mail-Adresse aus deiner Einladung." />
      <AnmeldeFormular hinweis={typeof grund === "string" ? ANMELDE_GRUENDE[grund] : undefined} />
    </>
  );
}
