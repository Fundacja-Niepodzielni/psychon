import type { Metadata } from "next";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Deklaracja dostępności — Niepodzielni",
};

/**
 * Deklaracja dostępności (WCAG 2.1 AA). Liczby w tym tekście pochodzą z
 * pierwszego audytu dostępności platformy (pomiar statyczny: kod źródłowy,
 * tokeny designu, istniejące testy — bez przeglądarki i bez czytnika ekranu).
 * Metoda i pełne wyniki: raport audytu w repozytorium dokumentacji projektu.
 *
 * Dwa pola poniżej NIE są wypełnione świadomie — dane kontaktowe Fundacji i
 * data przeglądu deklaracji to decyzje właściciela, nie coś, co można
 * wywnioskować z kodu.
 */
export default function DeklaracjaDostepnosciPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-h2 font-black text-ink">Deklaracja dostępności</h1>
      <p className="mt-2 text-body text-muted">
        Fundacja Niepodzielni dąży do zapewnienia dostępności platformy
        szkoleniowej Niepodzielni (PsychON) zgodnie ze standardem WCAG 2.1 na
        poziomie AA.
      </p>

      <Card className="mt-6" title="Stan zgodności">
        <p className="text-body text-ink">
          Platforma jest <strong>częściowo zgodna</strong> ze standardem WCAG
          2.1 AA. Poniższe liczby pochodzą z pierwszego audytu (pomiar
          statyczny kodu, {"09.2026"}):
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-body text-ink">
          <li>
            Struktura nagłówków: na 4 z 39 ocenianych ekranów (2 ekrany to
            wyłącznie przekierowania bez treści) brakuje nagłówka głównego
            (<code>h1</code>). Automatyczne wykrywanie przeskoków poziomu
            (np. h1→h3) nie znalazło żadnego potwierdzonego przypadku.
          </li>
          <li>
            Kontrast koloru: ze 75 sprawdzonych par tekst/tło z tokenów
            designu, 27 ma kontrast poniżej 4,5∶1, a 17 poniżej 3∶1. Część
            tych par to kolory oznaczone w kodzie jako wyłącznie dekoracyjne
            (nieużywane jako tekst).
          </li>
          <li>
            Etykiety pól formularzy: ze 96 pól w całej platformie, 0 nie ma
            dostępnej etykiety (<code>label</code>, <code>aria-label</code>{" "}
            lub <code>aria-labelledby</code>).
          </li>
          <li>
            Nawigacja klawiaturą: 1 element (okno podglądu e-maila w panelu
            administracji) reaguje na kliknięcie, ale nie ma wsparcia dla
            klawiatury.
          </li>
        </ul>
        <p className="mt-3 text-small text-subtle">
          Pełna tabela audytu (ekran po ekranie) i lista poprawek na kolejny
          etap: w raporcie audytu dostępności w repozytorium dokumentacji
          projektu.
        </p>
      </Card>

      <Card className="mt-6" title="Data sporządzenia deklaracji">
        <p className="text-body text-ink">Deklarację sporządzono: 2026-09-16.</p>
        <p className="mt-2 text-body text-ink">
          Data ostatniego przeglądu deklaracji:{" "}
          <span className="font-medium">
            [do uzupełnienia przez Fundację]
          </span>
          .
        </p>
      </Card>

      <Card className="mt-6" title="Zgłaszanie problemów z dostępnością">
        <p className="text-body text-ink">
          Jeśli napotkasz barierę w korzystaniu z platformy, zgłoś to:
        </p>
        <p className="mt-2 text-body text-ink">
          <span className="font-medium">
            [do uzupełnienia przez Fundację — adres e-mail lub telefon do
            zgłaszania problemów z dostępnością]
          </span>
        </p>
        <p className="mt-3 text-small text-subtle">
          Odpowiedzi na zgłoszenia udzielamy najszybciej, jak to możliwe.
        </p>
      </Card>
    </div>
  );
}
