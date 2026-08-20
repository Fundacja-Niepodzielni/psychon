import { redirect } from "next/navigation";

/** Strona główna → logowanie (starter nie ma strony publicznej). */
export default function HomePage() {
  redirect("/logowanie");
}
