import { Suspense } from "react";
import { Rahmen } from "@/components/app/shell";
import { RahmenPlatzhalter } from "@/components/app/platzhalter";
import { getCustomer } from "@/customers";

/**
 * Rahmen aller App-Seiten: Seitenleiste und Kopfzeile bleiben beim Seitenwechsel stehen, nur der Inhalt lädt
 * (loading.tsx je Bereich). Die Sitzung liest der Rahmen hinter einer Suspense-Grenze (Cache Components); bis dahin
 * steht beim ersten Aufruf ein leerer Rahmen mit Logo da.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const { Logo } = getCustomer();
  return (
    <Suspense fallback={<RahmenPlatzhalter logo={<Logo className="block w-full" />} />}>
      <Rahmen>{children}</Rahmen>
    </Suspense>
  );
}
