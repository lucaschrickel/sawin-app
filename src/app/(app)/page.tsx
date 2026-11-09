import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";

// Bis das Dashboard gebaut ist, führt die Startseite zu den Kunden.
export default async function Home() {
  await pruefeSitzung();
  redirect("/kunden");
}
