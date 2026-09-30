import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { FormyStazu } from "@/nowy-front/formy-stazu/FormyStazu";

export const metadata: Metadata = {
  title: "Formy stażu — Niepodzielni",
};

/**
 * Trasa produktu `/admin/formy-stazu` — nowa trasa grupy przełączenia
 * `formyStazu` (`lib/przelaczenie/grupy.ts`), ekran administracji. Bez
 * starej trasy: słownika form stażu dotąd w starym froncie nie było. Ekran
 * sam (`FormyStazu.tsx`, `frontend/nowy-front/formy-stazu/`) niesie własny
 * stan odmowy dostępu (odpowiedź 401/403 z zaplecza), a brak sesji obsługuje
 * klient API; jedyny `main#tresc` daje powłoka układu `admin/layout.tsx`.
 * Dopóki grupa jest wyłączona, adres odpowiada jak na bazie (404).
 */
export default function StronaFormStazu() {
  if (!czyNowaTrasaDostepna(GRUPY.formyStazu)) notFound();

  return <FormyStazu />;
}
