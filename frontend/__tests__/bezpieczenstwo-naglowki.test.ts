import { describe, test } from "vitest";

/**
 * Luki z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`) po stronie
 * frontu: `next.config.ts` nie ma `headers()`, więc strony panelu wychodzą bez
 * nagłówków bezpieczeństwa. Wpisy są `test.todo` do czasu poprawki — wtedy każdy
 * zamienia się w próbę, która woła `headers()` z `next.config.ts` i sprawdza
 * nagłówek dla ścieżki `/:path*`.
 */
describe("nagłówki bezpieczeństwa stron (next.config.ts headers())", () => {
  test.todo("V14.4.3: Content-Security-Policy jest ustawiony dla każdej ścieżki");
  test.todo("V14.4.4: X-Content-Type-Options ma wartość nosniff");
  test.todo("V14.4.5: Strict-Transport-Security ma max-age co najmniej jednego roku");
  test.todo("V14.4.7: CSP zawiera frame-ancestors 'none'");
  test.todo("V14.4.3, V14.4.7: panel administracji nie daje się osadzić w obcej ramce (X-Frame-Options: DENY)");
});
