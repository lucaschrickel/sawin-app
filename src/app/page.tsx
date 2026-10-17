import { redirect } from "next/navigation";

// Bis das Dashboard gebaut ist, führt die Startseite zum Designsystem.
export default function Home() {
  redirect("/styleguide");
}
