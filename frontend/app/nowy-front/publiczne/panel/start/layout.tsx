import type { ReactNode } from "react";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Układ strony podglądu ekranu „Zacznij tutaj” pod `/nowy-front/publiczne/panel/start`:
 * ten sam `StraznikUczestnika` co układ trasy produktu `/panel/start` — ekran widzi
 * osoba z rolą uczestnika (`student`, `volunteer`), a każda inna osoba wspólny ekran
 * „Nie masz dostępu do tego ekranu”. Ekran nie ma trybu podglądu, więc ten adres nie
 * jest wśród adresów otwieranych przez personel z `?podglad=1`. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role tego
 * strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuStartu({ children }: { children: ReactNode }) {
  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
