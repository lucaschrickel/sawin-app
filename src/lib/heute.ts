import "server-only";
import { connection } from "next/server";
import { heuteBerlin } from "@/lib/zeit";

/**
 * Heutiges Datum (Berlin) in Server-Komponenten. Mit Cache Components darf die aktuelle Zeit erst nach einem
 * dynamischen Zugriff gelesen werden (sonst: „unstable value Date.now() while prerendering“); connection() sorgt dafür.
 */
export async function heute(): Promise<string> {
  await connection();
  return heuteBerlin();
}
