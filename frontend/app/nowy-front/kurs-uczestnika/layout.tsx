import type { ReactNode } from "react";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Układ stron podglądu kursu uczestnika i jego testu pod
 * `/nowy-front/kurs-uczestnika`: ten sam `StraznikUczestnika` co układ tras
 * produktu `/panel/kursy/[slug]` i `/panel/kursy/[slug]/test` — ekran widzi
 * osoba z rolą uczestnika (`student`, `volunteer`), personel i prowadzący
 * w trybie podglądu (parametr `podglad` o wartości 1), a każda inna osoba wspólny ekran „Nie masz
 * dostępu do tego ekranu”. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuKursuUczestnika({ children }: { children: ReactNode }) {
  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
