/**
 * Wspólne zdania o błędach serwera, sieci i zapisu. Ekran nie składa własnego
 * zdania na ten temat — bierze jedno z tych trzech, żeby osoba w całym panelu
 * czytała ten sam, prosty komunikat i wiedziała, co może zrobić.
 *
 *  - serwer nie odpowiedział albo zwrócił błąd → `KOMUNIKAT_SERWER`;
 *  - brak internetu (tam, gdzie ekran to odróżnia) → `KOMUNIKAT_INTERNET`;
 *  - zapis się nie powiódł → `KOMUNIKAT_ZAPIS`.
 */

export const KOMUNIKAT_SERWER = "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";

export const KOMUNIKAT_INTERNET = "Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.";

export const KOMUNIKAT_ZAPIS = "Nie udało się zapisać. Spróbuj ponownie.";
