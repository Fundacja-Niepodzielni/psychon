import type { ReactNode } from "react";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Układ strony podglądu dokumentów uczestnika pod `/nowy-front/dokumenty`: ten sam
 * `StraznikUczestnika` co układ trasy produktu `/panel/dokumenty` — ekran widzi
 * osoba z rolą uczestnika (`student`, `volunteer`), a każda inna osoba wspólny
 * ekran „Nie masz dostępu do tego ekranu”. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuDokumentow({ children }: { children: ReactNode }) {
  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
