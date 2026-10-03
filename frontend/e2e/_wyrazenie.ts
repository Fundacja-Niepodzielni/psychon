/**
 * Pomocnik prób przeglądarkowych: zamienia tekst (np. adres strony) na
 * fragment wyrażenia regularnego, który dopasowuje się do tego tekstu dosłownie.
 * Znaki specjalne wyrażenia — razem z ukośnikiem wstecznym — dostają ukośnik
 * wsteczny; ukośnik zwykły zostaje bez zmian.
 */
export function ucieknijWyrazenie(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
