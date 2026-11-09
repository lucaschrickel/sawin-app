import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";

// Bis das Dashboard gebaut ist, führt die Startseite zum Designsystem.
export default async function Home() {
  await pruefeSitzung();
  redirect("/styleguide");
}
