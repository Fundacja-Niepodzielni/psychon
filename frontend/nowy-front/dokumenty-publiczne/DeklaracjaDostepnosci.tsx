import type { ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import style from "./DokumentyPubliczne.module.css";

/**
 * Deklaracja dostępności w nowym wyglądzie — słowo w słowo ta sama treść co
 * `app/deklaracja-dostepnosci/page.tsx` (liczby z pomiaru 18.09.2026, pole
 * daty przeglądu świadomie niewypełnione, kontakt podany przez właściciela).
 * Ekran nie linkuje do siebie w stopce.
 */
export function DeklaracjaDostepnosci({ logo }: { logo?: ReactNode }) {
  return (
    <RamaPubliczna logo={logo} szerokosc="czytelna" bezDeklaracji>
      <Heading stopien={1}>Deklaracja dostępności</Heading>
      <Text>
        Fundacja Niepodzielni dąży do zapewnienia dostępności platformy szkoleniowej Niepodzielni (PsychON) zgodnie
        ze standardem WCAG 2.1 na poziomie AA.
      </Text>

      <Karta>
        <Heading stopien={2}>Stan zgodności</Heading>
        <div className={style.tresc}>
          <Text>
            Platforma jest <strong>częściowo zgodna</strong> ze standardem WCAG 2.1 AA. Poniższe liczby, poza
            kontrastem koloru, pochodzą z ponownego pomiaru na dzisiejszym drzewie ({"18.09.2026"}); pierwszy audyt
            był w {"09.2026"}:
          </Text>
          <ul className={style.lista}>
            <li>
              Struktura nagłówków: dziś <strong>0</strong> z 44 ekranów z renderowaną treścią (na 46 ekranów ogółem w
              drzewie; pozostałe 2 to wyłącznie przekierowania bez treści) nie ma nagłówka głównego (<code>h1</code>).
              Pierwszy audyt (09.2026) opisywał tu 4 braki — zostały uzupełnione.
            </li>
            <li>
              Kontrast koloru: <strong>nieobjęty dzisiejszym pomiarem automatycznym</strong>. Liczby z pierwszego
              audytu (75 par, 27 poniżej 4,5∶1, 17 poniżej 3∶1) dotyczyły tokenów kolorów, które od tamtego pomiaru
              się zmieniły — dziś ich nie powtarzamy, żeby nie pokazywać nieaktualnej liczby jako aktualnej. W
              repozytorium działa węższe narzędzie (kolory stanu: odznaki, alerty, linki — 55 kombinacji kolor/tło,
              nie cała przestrzeń tokenów); pełny ponowny audyt kontrastu jest zaplanowany osobno.
            </li>
            <li>
              Etykiety pól formularzy: dziś <strong>0</strong> z 22 natywnych pól (<code>input</code>/
              <code>textarea</code>/<code>select</code> w kodzie źródłowym) nie ma dostępnej etykiety (
              <code>label</code>, <code>aria-label</code> lub <code>aria-labelledby</code>). Ta liczba pól liczy
              inaczej niż 96 z pierwszego audytu (tam: natywne pola razem z polami przez komponenty formularza) — nie
              jest z nią wprost porównywalna.
            </li>
            <li>
              Nawigacja klawiaturą: dziś <strong>0</strong> elementów reagujących na kliknięcie bez wsparcia
              klawiatury. Pierwszy audyt (09.2026) opisywał tu 1 brak (okno podglądu e-maila w panelu administracji) —
              okno dostało kolejność tabulacji, fokus przy otwarciu, zamykanie klawiszem Escape i powrót fokusu po
              zamknięciu.
            </li>
          </ul>
          <p className={style.drobny}>
            Ten pomiar nie obejmuje: pełnego ponownego przeliczenia kontrastu kolorów (wyżej), ról orientacyjnych
            treści (landmarks: main, nav, banner, contentinfo — nie były przedmiotem żadnego audytu) ani czterech
            ekranów, które nigdy nie przeszły audytu dostępności: <code>/admin/ekran-startowy</code>,{" "}
            <code>/panel/po-programie</code>, <code>/katalog-komponentow/a</code> i <code>/katalog-komponentow/b</code>.
          </p>
          <p className={style.drobny}>
            Pełna tabela audytu (ekran po ekranie) i lista poprawek na kolejny etap: w raporcie audytu dostępności w
            repozytorium (<code>frontend/AUDYT-DOSTEPNOSCI.md</code>). Ten raport opisuje metodę pomiaru słownie;
            polecenia użyte do dzisiejszego pomiaru nie są dziś częścią tego repozytorium i nie twierdzimy tu, że
            ktokolwiek inny je dziś odtworzy.
          </p>
        </div>
      </Karta>

      <Karta>
        <Heading stopien={2}>Data sporządzenia deklaracji</Heading>
        <div className={style.tresc}>
          <Text>Deklarację sporządzono: 2026-09-16.</Text>
          <Text>
            Data ostatniego przeglądu deklaracji: <strong>[do uzupełnienia przez Fundację]</strong>.
          </Text>
        </div>
      </Karta>

      <Karta>
        <Heading stopien={2}>Zgłaszanie problemów z dostępnością</Heading>
        <div className={style.tresc}>
          <Text>Jeśli napotkasz barierę w korzystaniu z platformy, zgłoś to:</Text>
          <Text>
            <strong>
              <Link href="mailto:kontakt@niepodzielni.com">kontakt@niepodzielni.com</Link>
            </strong>
          </Text>
          <p className={style.drobny}>Odpowiedzi na zgłoszenia udzielamy najszybciej, jak to możliwe.</p>
        </div>
      </Karta>
    </RamaPubliczna>
  );
}
