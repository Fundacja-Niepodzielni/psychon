import type { ReactNode } from "react";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Układ strony podglądu lekcji pod `/nowy-front/lekcja`: ten sam
 * `StraznikUczestnika` co układ trasy produktu `/panel/lekcje/[id]` — ekran
 * widzi osoba z rolą uczestnika (`student`, `volunteer`), personel
 * i prowadzący w trybie podglądu (parametr `podglad` o wartości 1), a każda inna osoba wspólny
 * ekran „Nie masz dostępu do tego ekranu”. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuLekcji({ children }: { children: ReactNode }) {
  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
