import type { Metadata } from "next";
import { Kopf, VergessenFormular } from "../formulare";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function PasswortVergessenPage() {
  return (
    <>
      <Kopf titel="Passwort vergessen" text="Wir schicken dir einen Link, mit dem du ein neues Passwort setzt. Danach fragt die App wie gewohnt nach dem Code." />
      <VergessenFormular />
    </>
  );
}
