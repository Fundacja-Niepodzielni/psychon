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
 * Deklaracja dostępności (WCAG 2.1 AA). Liczby w tym tekście dla nagłówków,
 * klawiatury i etykiet pól pochodzą z ponownego pomiaru na dzisiejszym
 * drzewie (2026-09-18, pomiar statyczny: kod źródłowy — bez przeglądarki i
 * bez czytnika ekranu). Kontrast kolorów NIE został dziś ponownie zmierzony
 * w pełnym zakresie pierwotnego audytu (token źródłowy zmienił się od tamtego
 * pomiaru) — opisany niżej jako nieobjęty dzisiejszym pomiarem automatycznym.
 * Metoda, polecenia i pełne wyniki (w tym cztery ekrany, które audyt nigdy nie
 * objął): raport audytu dostępności w repozytorium (`frontend/AUDYT-
 * DOSTEPNOSCI.md`, sekcja „Dodatek — ponowny pomiar 2026-09-18”).
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
            2.1 AA. Poniższe liczby, poza kontrastem koloru, pochodzą z
            ponownego pomiaru na dzisiejszym drzewie ({"18.09.2026"}); pierwszy
            audyt był w {"09.2026"}:
          </Text>
          <BulletList>
            <li>
              Struktura nagłówków: dziś <strong>0</strong> z 44 ekranów z
              renderowaną treścią (na 46 ekranów ogółem w drzewie; pozostałe 2
              to wyłącznie przekierowania bez treści) nie ma nagłówka głównego
              (<code>h1</code>). Pierwszy audyt (09.2026) opisywał tu 4 braki —
              zostały uzupełnione.
            </li>
            <li>
              Kontrast koloru: <strong>nieobjęty dzisiejszym pomiarem
              automatycznym</strong>. Liczby z pierwszego audytu (75 par, 27
              poniżej 4,5∶1, 17 poniżej 3∶1) dotyczyły tokenów kolorów, które
              od tamtego pomiaru się zmieniły — dziś ich nie powtarzamy, żeby
              nie pokazywać nieaktualnej liczby jako aktualnej. W repozytorium
              działa węższe narzędzie (kolory stanu: odznaki, alerty, linki —
              55 kombinacji kolor/tło, nie cała przestrzeń tokenów); pełny
              ponowny audyt kontrastu jest zaplanowany osobno.
            </li>
            <li>
              Etykiety pól formularzy: dziś <strong>0</strong> z 22 natywnych
              pól (<code>input</code>/<code>textarea</code>/<code>select</code>{" "}
              w kodzie źródłowym) nie ma dostępnej etykiety (<code>label</code>,{" "}
              <code>aria-label</code> lub <code>aria-labelledby</code>). Ta
              liczba pól liczy inaczej niż 96 z pierwszego audytu (tam:
              natywne pola razem z polami przez komponenty formularza) — nie
              jest z nią wprost porównywalna.
            </li>
            <li>
              Nawigacja klawiaturą: dziś <strong>0</strong> elementów
              reagujących na kliknięcie bez wsparcia klawiatury. Pierwszy
              audyt (09.2026) opisywał tu 1 brak (okno podglądu e-maila w
              panelu administracji) — okno dostało kolejność tabulacji, fokus
              przy otwarciu, zamykanie klawiszem Escape i powrót fokusu po
              zamknięciu.
            </li>
          </BulletList>
          <Text size="small" tone="muted">
            Ten pomiar nie obejmuje: pełnego ponownego przeliczenia kontrastu
            kolorów (wyżej), ról orientacyjnych treści (landmarks: main, nav,
            banner, contentinfo — nie były przedmiotem żadnego audytu) ani
            czterech ekranów, które nigdy nie przeszły audytu dostępności:{" "}
            <code>/admin/ekran-startowy</code>,{" "}
            <code>/panel/po-programie</code>,{" "}
            <code>/katalog-komponentow/a</code> i{" "}
            <code>/katalog-komponentow/b</code>.
          </Text>
          <Text size="small" tone="muted">
            Pełna tabela audytu (ekran po ekranie), polecenia użyte do
            dzisiejszego pomiaru i lista poprawek na kolejny etap: w raporcie
            audytu dostępności w repozytorium (
            <code>frontend/AUDYT-DOSTEPNOSCI.md</code>).
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
