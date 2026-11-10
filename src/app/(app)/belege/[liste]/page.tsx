import type { Metadata } from "next";
import { BelegListe, LISTEN } from "../liste";

export async function generateMetadata({ params }: PageProps<"/belege/[liste]">): Promise<Metadata> {
  return { title: LISTEN[(await params).liste]?.titel ?? "Belege" };
}

/** Belegübersicht je Belegart (Angebote, Lieferscheine, Abschläge, Rechnungen, Gutschriften) und „Offene Forderungen“ */
export default async function BelegartListePage({ params, searchParams }: PageProps<"/belege/[liste]">) {
  const { liste } = await params;
  return <BelegListe liste={liste === "alle" ? "" : liste} searchParams={searchParams} />;
}
