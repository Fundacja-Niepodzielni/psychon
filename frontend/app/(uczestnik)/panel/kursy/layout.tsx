import type { ReactNode } from "react";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Ekrany pod `/panel/kursy` widzi osoba z rolą uczestnika (`StraznikUczestnika`); każda inna osoba
 * widzi wspólny ekran „Nie masz dostępu do tego ekranu”. Strażnik stoi w układzie segmentu, nie
 * w układzie całego `/panel`, żeby odpowiedzi serwera (404, przekierowania) zapadały przed nim.
 */
export default function Uklad({ children }: { children: ReactNode }) {
  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
