import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Button } from "../atomy/Button/Button";
import { Link } from "../atomy/Link/Link";
import { Checkbox } from "../atomy/Checkbox/Checkbox";
import { Input } from "../atomy/Input/Input";
import { Textarea } from "../atomy/Textarea/Textarea";
import { Icon } from "../atomy/Icon/Icon";
import { Select } from "../atomy/Select/Select";
import { Badge } from "../atomy/Badge/Badge";
import { Label } from "../atomy/Label/Label";
import { Hint } from "../atomy/Hint/Hint";
import { ErrorText } from "../atomy/ErrorText/ErrorText";
import { Skeleton } from "../atomy/Skeleton/Skeleton";
import { Avatar } from "../atomy/Avatar/Avatar";
import { ProgressBar } from "../atomy/ProgressBar/ProgressBar";
import { StepBar } from "../atomy/StepBar/StepBar";
import { Heading } from "../atomy/Heading/Heading";
import { Text } from "../atomy/Text/Text";
import { Num } from "../atomy/Num/Num";
import { Divider } from "../atomy/Divider/Divider";

// Motyw sterowany parametrem ?theme=dark|light, żeby Playwright mógł go
// ustawić przed pomiarem bez dotykania localStorage ani MVP.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
if (motyw === "dark" || motyw === "light") {
  document.documentElement.setAttribute("data-theme", motyw);
}

// Poligon montuje WSZYSTKIE 19 zbudowanych atomów z 06-ATOMY-MOLEKULY-ORGANIZMY.md
// §2 (poprzednia wersja tego
// komentarza mówiła "WSZYSTKIE 20 atomów", myląc liczbę NAZWANYCH pozycji
// specyfikacji z liczbą ZBUDOWANYCH komponentów). Spec numeruje A1-A20 (20
// pozycji), ale A7 `Radio` nie istnieje (spec: "Atom nie powstaje, dopóki
// żaden ekran go nie wymaga") — stąd 19 katalogów w `design-system/atomy/`
// (`ls -d design-system/atomy/*/ | wc -l` -> 19), 19 instancji tu.
//
// Par. 8.2: każdy atom dostaje TYLE mountów, ile ma nazwanych
// wariantów i stanów w kolumnie „Warianty i stany” (patrz
// design-system/poligon/pozycje-warianty-stany-par2.mjs — mianownik 69/15
// wycięty z tamtego pliku, nie z tego). Stany zależne od INTERAKCJI (fokus,
// kursor, otwarcie listy) nie potrzebują tu osobnego mountu — engine
// (pomiar-styl-atomow.mjs) wykonuje akcję (hover/focus/klik) na już
// zamontowanym elemencie. Stany zależne od PROPS/atrybutu (niepoprawny,
// tylko do odczytu, zaznaczony, aria-busy, zrobiony/bieżący/przed nami)
// dostają własny mount, bo to jedyny sposób, żeby atrybut w ogóle istniał
// w drzewie.
//
// Trzy pozycje NIE są tu montowane — GAPY_JAWNE w pozycje-warianty-stany-par2.mjs
// (A2 „tło odwrócone” nieobecne w Link.tsx, A13 „wys. przycisku 34px”
// nieobecne w Skeleton.tsx, A14 „przerywana” to w specyfikacji „tylko nota”).
function Poligon() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <p>Poligon pomiarowy atomów — nie jest stroną produktu, tylko narzędziem pomiarowym.</p>

      {/* A1 Button — warianty: primary, outline, quiet, sm, danger, lock; stany: kursor (statyczny cursor:pointer), fokus (akcja), nieaktywny (mount disabled) */}
      <Button poziom="primary" data-testid="button-primary">Zapisz zmiany</Button>
      <Button poziom="outline" data-testid="button-outline">Anuluj</Button>
      <Button poziom="quiet" data-testid="button-quiet">Pomiń</Button>
      <Button poziom="primary" rozmiar="sm" data-testid="button-sm">Dodaj</Button>
      <Button poziom="quiet" data-testid="icon-button"><Icon nazwa="home" /></Button>
      <Button poziom="outline" niebezpieczny data-testid="a1-danger">Usuń konto</Button>
      <Button poziom="outline" disabled data-testid="a1-lock">Zablokowane (lekcja)</Button>
      <Button poziom="outline" disabled data-testid="a1-nieaktywny">Nieaktywny</Button>

      {/* A2 Link — warianty: w treści, okruszki (tło odwrócone: GAP, patrz main.tsx wstęp); stany: kursor (statyczny), fokus (akcja) */}
      <p><Link href="#" data-testid="link">Przejdź do lekcji</Link></p>
      <p><Link href="#" wariant="okruszek" data-testid="link-okruszek">Kurs / Lekcja 3</Link></p>

      {/* A6 Checkbox — wariant/stan: zaznaczony (mount checked=true); stany: kursor (statyczny), fokus (akcja na #pol-zgoda) */}
      <Checkbox id="pol-zgoda" zaznaczony onZmiana={() => {}} etykieta="Zgadzam się" />

      {/* A3 Input — warianty: tekst, liczba, data; stany: fokus (akcja), niepoprawny (mount), tylko do odczytu (mount) */}
      <Input rodzaj="tekst" aria-label="Imię" data-testid="input" />
      <Input rodzaj="liczba" aria-label="Wiek" data-testid="a3-liczba" />
      <Input rodzaj="data" aria-label="Data urodzenia" data-testid="a3-data" />
      <Input rodzaj="tekst" aria-label="Pole niepoprawne" niepoprawny data-testid="a3-niepoprawny" />
      <Input rodzaj="tekst" aria-label="Pole tylko do odczytu" readOnly value="Wartość" data-testid="a3-readonly" />

      {/* A4 Textarea — wariant: jeden wariant; stany: fokus (akcja), niepoprawny (mount), tylko do odczytu (mount) */}
      <Textarea aria-label="Opis" data-testid="textarea" />
      <Textarea aria-label="Opis niepoprawny" niepoprawny data-testid="a4-niepoprawny" />
      <Textarea aria-label="Opis tylko do odczytu" readOnly value="Treść" data-testid="a4-readonly" />

      {/* A5 Select — własna kontrolka, role=combobox jednoznaczny na stronie.
          Stany zamknięta/otwarta/pod kursorem/wybrana/fokus mierzone AKCJĄ
          na TYM SAMYM zamontowanym elemencie (patrz pomiar-styl-atomow.mjs) */}
      <Select
        opcje={[
          { wartosc: "a", etykieta: "Wariant A" },
          { wartosc: "b", etykieta: "Wariant B" },
        ]}
        domyslnaWartosc="a"
        aria-label="Wybór wariantu"
      />

      {/* A8 Badge — warianty: neutral, ok, warn, error, pending, z licznikiem */}
      <div data-style-id="atom-badge">
        <Badge wariant="neutral">Aktywny</Badge>
      </div>
      <div data-style-id="atom-badge-ok"><Badge wariant="ok">Zaliczone</Badge></div>
      <div data-style-id="atom-badge-warn"><Badge wariant="warn">Uwaga</Badge></div>
      <div data-style-id="atom-badge-error"><Badge wariant="error">Błąd</Badge></div>
      <div data-style-id="atom-badge-pending"><Badge wariant="pending">Oczekuje</Badge></div>
      <div data-style-id="atom-badge-licznik"><Badge wariant="neutral">12</Badge></div>

      {/* A9 Label — warianty: zwykła, z gwiazdką */}
      <div>
        <Label htmlFor="atom-label-cel" dzieci="Etykieta pola" />
        <input id="atom-label-cel" aria-hidden="true" tabIndex={-1} style={{ position: "absolute", opacity: 0 }} />
      </div>
      <div data-style-id="atom-label-wymagane">
        <Label htmlFor="atom-label-wymagane-pole" dzieci="Etykieta wymagana" wymagane />
        <input id="atom-label-wymagane-pole" aria-hidden="true" tabIndex={-1} style={{ position: "absolute", opacity: 0 }} />
      </div>

      {/* A10 Hint — jedna implementacja, 3 umiejscowienia (pod kontrolką, w nagłówku, w wierszu) — bez różnicy w wyglądzie, ale każde miejsce zmierzone osobno */}
      <Hint id="atom-hint">Podpowiedź pod polem.</Hint>
      <div data-style-id="atom-hint-naglowek">
        <Hint>Podpowiedź w nagłówku pojemnika.</Hint>
      </div>
      <table>
        <tbody>
          <tr data-style-id="atom-hint-wiersz">
            <td><Hint>Podpowiedź w wierszu.</Hint></td>
          </tr>
        </tbody>
      </table>

      {/* A11 ErrorText — jedyna pozycja: po próbie zapisu (atom zawsze reprezentuje ten stan, gdy jest wyrenderowany z treścią) */}
      <ErrorText id="atom-errortext">Popraw ten błąd.</ErrorText>

      {/* A12 Icon — warianty rozmiaru: 18px, 16px, 26px */}
      <div data-style-id="atom-icon">
        <Icon nazwa="home" rozmiar={18} />
      </div>
      <div data-style-id="atom-icon-16">
        <Icon nazwa="home" rozmiar={16} />
      </div>
      <div data-style-id="atom-icon-26">
        <Icon nazwa="home" rozmiar={26} />
      </div>

      {/* A13 Skeleton — wariant: pasek; stan: pojemnik aria-busy (ten sam mount, dwa odczyty) */}
      <div data-style-id="atom-skeleton">
        <Skeleton wiersze={1} />
      </div>

      {/* A14 Divider — wariant: pełna (rola=separator jednoznaczna na stronie); "przerywana" to GAP jawny, spec ją oznacza jako "tylko nota" */}
      <Divider />

      {/* A15 Avatar — wariant: inicjały */}
      <div data-style-id="atom-avatar">
        <Avatar imie="Jan" nazwisko="Kowalski" />
      </div>

      {/* A16 ProgressBar — warianty: w kaflu, w odtwarzaczu */}
      <div data-style-id="atom-progressbar-kafel">
        <ProgressBar procent={40} etykieta="4 z 10 zadań" />
      </div>
      <div data-style-id="atom-progressbar-odtwarzacz">
        <ProgressBar procent={65} etykieta="13 z 20 minut" wariant="odtwarzacz" />
      </div>

      {/* A17 StepBar — stany: zrobiony, bieżący, przed nami (ten sam mount, trzy odczyty na różnych krokach) */}
      <StepBar zrobione={2} razem={7} jednostka="lekcji ukończonych" />

      {/* A18 Heading — warianty: stopień 1, 2, 3, 4; stan: fokus programowy na 2 (akcja na #atom-heading-2, tabIndex=-1 wbudowany w komponent) */}
      <Heading stopien={1} id="atom-heading">Tydzień 24 z 40</Heading>
      <Heading stopien={2} id="atom-heading-2">Sekcja: postępy</Heading>
      <Heading stopien={3} id="atom-heading-3">Podsekcja: zadania</Heading>
      <Heading stopien={4} id="atom-heading-4">Szczegół: termin</Heading>

      {/* A19 Text — warianty: zwykły, lekcja, stan pusty */}
      <div data-style-id="atom-text">
        <Text>To jest przykładowy akapit treści atomu Text.</Text>
      </div>
      <div data-style-id="atom-text-lekcja">
        <Text wariant="lekcja">Treść lekcji ograniczona do 68 znaków szerokości.</Text>
      </div>
      <div data-style-id="atom-text-pusty">
        <Text wariant="pusty">Brak danych do pokazania.</Text>
      </div>

      {/* A20 Num — warianty umiejscowienia: w tekście, w tabeli, w kaflu (jedna implementacja, bez różnicy wyglądu) */}
      <p data-style-id="atom-num-tekst">
        Ukończono <Num wartosc={18} etykieta="z 72 godzin" /> w tym miesiącu.
      </p>
      <table>
        <tbody>
          <tr>
            <td data-style-id="atom-num-tabela"><Num wartosc={4} etykieta="lekcji" /></td>
          </tr>
        </tbody>
      </table>
      <div data-style-id="atom-num-kafel">
        <Num wartosc={92} etykieta="% ukończenia" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Poligon />);
