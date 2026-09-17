import type { MenuEntry } from "../types";

/**
 * Moja grupa — tabela postępów uczestniczek, terminy superwizji, obecności
 * i zgłoszenie sprawy. Ekran leży pod `/prowadzacy/grupa` i był dotąd
 * osiągalny wyłącznie przez wpisanie adresu z ręki.
 *
 * `order` 15, a nie 20: grupa ma stać między startem (10) a pytaniami (20),
 * a wartości w jednym rejestrze muszą być różne, bo przy równych o kolejności
 * decyduje przypadkowa pozycja w tablicy, nie decyzja.
 */
const entry: MenuEntry = {
  label: "Moja grupa",
  href: "/prowadzacy/grupa",
  order: 15,
  icon: "users",
};

export default entry;
