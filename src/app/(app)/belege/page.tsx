import type { Metadata } from "next";
import { BelegListe } from "./liste";

export const metadata: Metadata = { title: "Alle Belege" };

export default function AlleBelegePage({ searchParams }: PageProps<"/belege">) {
  return <BelegListe liste="alle" searchParams={searchParams} />;
}
