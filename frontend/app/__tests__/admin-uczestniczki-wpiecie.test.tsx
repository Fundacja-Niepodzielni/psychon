import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Świadek WPIĘCIA ekranu H03 do interfejsu (ekran jeszcze nie ma zakładki we froncie).
 *
 * `ApplicationsTab` istnieje i działa — ma własnego świadka zachowania obok
 * (`components/h03/__tests__`, 8 zielonych). Luka jest gdzie indziej: ekran jest
 * **nieosiągalny z interfejsu**, bo `#/admin/uczestniczki` renderuje wyłącznie listę
 * H18, bez zakładek. Kompletny komponent, do którego nie da się dojść, jest
 * z punktu widzenia użytkowniczki tym samym co komponent nieistniejący.
 *
 * Dlaczego świadek czyta ŹRÓDŁO strony, a nie renderuje jej w jsdom: to jest
 * komponent serwerowy Next.js z `metadata` i bez `"use client"`. Renderowanie go
 * w jsdom mierzyłoby zdolność atrapy do udawania serwera Next, a nie wpięcie.
 * Pytanie jest strukturalne — „czy ta strona w ogóle sięga po zakładkę zgłoszeń" —
 * i uczciwiej odpowiada na nie odczyt importów.
 *
 * ⚠ Czego NIE dowodzi: że zakładki działają, przełączają się i mają dostęp roli.
 * Dowodzi, że droga do ekranu istnieje. Dziś nie istnieje.
 *
 * ⚠ CZERWONY do czasu naprawy w zakresie FRONT. Nie naprawiam cudzego kodu.
 */

// Ścieżka liczona od katalogu, w którym biegnie Vitest (`frontend`), a nie od
// `import.meta.url` — ten w konfiguracji tego runnera nie jest adresem `file:`.
const STRONA = join(process.cwd(), "app", "(administracja)", "admin", "uczestniczki", "page.tsx");

function zrodloStrony(): string {
  return readFileSync(STRONA, "utf8");
}

describe("#/admin/uczestniczki", () => {
  it("sięga po zakładkę zgłoszeń H03", () => {
    const zrodlo = zrodloStrony();

    expect(
      /from\s+["']@\/components\/h03\/[^"']+["']/.test(zrodlo),
      "Strona uczestniczek nie importuje niczego z `components/h03`. Ekran zgłoszeń "
        + "istnieje w całości, ale jest nieosiągalny z interfejsu — a kryteria ★ H03.1–2 "
        + "są kryteriami Z EKRANU, nie z API.",
    ).toBe(true);
  });

  it("nadal pokazuje listę osób H18", () => {
    // KONTROLA NEGATYWNA wpięcia: „dodaj zakładki" nie może znaczyć „podmień
    // zawartość". Lista H18 jest na tej trasie od początku i ma tam zostać.
    const zrodlo = zrodloStrony();

    expect(
      /from\s+["']@\/components\/h18\/[^"']+["']/.test(zrodlo),
      "Strona uczestniczek przestała importować listę H18 — wpięcie zgłoszeń zjadło "
        + "ekran, który już działał.",
    ).toBe(true);
  });

  it("przyrząd czyta prawdziwy plik, a nie pustkę", () => {
    // Bez tego dwa testy wyżej byłyby zielone także wtedy, gdyby ścieżka była zła
    // i `readFileSync` zwracał coś przypadkowego — a wtedy mierzyłyby nic.
    expect(zrodloStrony()).toContain("export default function");
  });
});
