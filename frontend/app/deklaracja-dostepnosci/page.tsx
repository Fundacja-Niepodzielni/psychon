import type { Metadata } from "next";
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";
import BulletList from "@/components/ui/BulletList";
import Card from "@/components/ui/Card";
import Stack from "@/components/ui/Stack";
import Text from "@/components/ui/Text";

export const metadata: Metadata = {
  title: "Deklaracja dostępności — Niepodzielni",
};

/**
 * Deklaracja dostępności (WCAG 2.1 AA). Liczby w tym tekście pochodzą z
 * pierwszego audytu dostępności platformy (pomiar statyczny: kod źródłowy,
 * tokeny designu, istniejące testy — bez przeglądarki i bez czytnika ekranu).
 * Metoda i pełne wyniki: raport audytu w repozytorium dokumentacji projektu.
 *
 * Pole „Data ostatniego przeglądu deklaracji” poniżej NIE jest wypełnione
 * świadomie — data i osoba dokonująca przeglądu to decyzja właściciela,
 * która jeszcze nie zapadła, nie coś, co można wywnioskować z kodu. Kontakt
 * do zgłaszania barier dostępności podał właściciel 2026-09-16.
 */
export default function DeklaracjaDostepnosciPage() {
  return (
    <PublicPageTemplate
      naglowek={{
        title: "Deklaracja dostępności",
        description:
          "Fundacja Niepodzielni dąży do zapewnienia dostępności platformy szkoleniowej Niepodzielni (PsychON) zgodnie ze standardem WCAG 2.1 na poziomie AA.",
      }}
    >
      <Card title="Stan zgodności">
        <Stack>
          <Text>
            Platforma jest <strong>częściowo zgodna</strong> ze standardem WCAG
            2.1 AA. Poniższe liczby pochodzą z pierwszego audytu (pomiar
            statyczny kodu, {"09.2026"}):
          </Text>
          <BulletList>
            <li>
              Struktura nagłówków: na 4 z 39 ocenianych ekranów (2 ekrany to
              wyłącznie przekierowania bez treści) brakuje nagłówka głównego (
              <code>h1</code>). Automatyczne wykrywanie przeskoków poziomu (np.
              h1→h3) nie znalazło żadnego potwierdzonego przypadku.
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
          </BulletList>
          <Text size="small" tone="muted">
            Pełna tabela audytu (ekran po ekranie) i lista poprawek na kolejny
            etap: w raporcie audytu dostępności w repozytorium dokumentacji
            projektu.
          </Text>
        </Stack>
      </Card>

      <Card title="Data sporządzenia deklaracji">
        <Stack>
          <Text>Deklarację sporządzono: 2026-09-16.</Text>
          <Text>
            Data ostatniego przeglądu deklaracji:{" "}
            <strong>[do uzupełnienia przez Fundację]</strong>.
          </Text>
        </Stack>
      </Card>

      <Card title="Zgłaszanie problemów z dostępnością">
        <Stack>
          <Text>
            Jeśli napotkasz barierę w korzystaniu z platformy, zgłoś to:
          </Text>
          <Text>
            <strong>
              <a
                href="mailto:kontakt@niepodzielni.com"
                className="text-accent underline underline-offset-2 hover:text-accent-dark focus-visible:focus-ring"
              >
                kontakt@niepodzielni.com
              </a>
            </strong>
          </Text>
          <Text size="small" tone="muted">
            Odpowiedzi na zgłoszenia udzielamy najszybciej, jak to możliwe.
          </Text>
        </Stack>
      </Card>
    </PublicPageTemplate>
  );
}
