import { redirect } from "next/navigation";

/** /panel → /panel/start (strona startowa uczestnika). */
export default function PanelIndexPage() {
  redirect("/panel/start");
}
