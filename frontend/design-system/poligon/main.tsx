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
import { Field } from "../molekuly/Field/Field";
import { SearchBox } from "../molekuly/SearchBox/SearchBox";
import { ListRow } from "../molekuly/ListRow/ListRow";
import { KeyValueRow } from "../molekuly/KeyValueRow/KeyValueRow";
import { Breadcrumbs } from "../molekuly/Breadcrumbs/Breadcrumbs";
import { Tabs } from "../molekuly/Tabs/Tabs";
import { MenuGroup } from "../molekuly/MenuItem/MenuGroup";
import { Pagination } from "../molekuly/Pagination/Pagination";
import { Toast } from "../molekuly/Toast/Toast";
import { CollapsibleSection } from "../molekuly/CollapsibleSection/CollapsibleSection";
import { EmptyState } from "../molekuly/EmptyState/EmptyState";
import { RichTextEditor } from "../molekuly/RichTextEditor/RichTextEditor";
import { QaBlock } from "../molekuly/QaBlock/QaBlock";
import { PublishChecklist } from "../organizmy/PublishChecklist/PublishChecklist";
import { PageHeader } from "../organizmy/PageHeader/PageHeader";
import { PanelNav } from "../organizmy/PanelNav/PanelNav";
import { StatRow } from "../organizmy/StatRow/StatRow";
import { RecordList } from "../organizmy/RecordList/RecordList";
import { CaseCard } from "../organizmy/CaseCard/CaseCard";
import { DataTable } from "../organizmy/DataTable/DataTable";
import { FileDropZone } from "../molekuly/FileDropZone/FileDropZone";
import { FileRow } from "../molekuly/FileRow/FileRow";
import { StatTile } from "../molekuly/StatTile/StatTile";
import { Notice } from "../molekuly/Notice/Notice";
import { DialogActions } from "../molekuly/DialogActions/DialogActions";
import { SaveBar } from "../molekuly/SaveBar/SaveBar";

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
// Jedna pozycja NIE jest tu montowana — GAPY_JAWNE w pozycje-warianty-stany-par2.mjs
// (A14 „przerywana” to w specyfikacji „tylko nota”, materia do
// rozstrzygnięcia w samej specyfikacji, nie
// wada wykonania). A2 „tło odwrócone” i A13 „wys. przycisku 34px” były tu
// gapami wcześniej — teraz zbudowane w Link.tsx/Skeleton.tsx i zmontowane niżej.
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

      {/* A2 Link — warianty: w treści, okruszki, tło odwrócone; stany: kursor (statyczny), fokus (akcja) */}
      <p><Link href="#" data-testid="link">Przejdź do lekcji</Link></p>
      <p><Link href="#" wariant="okruszek" data-testid="link-okruszek">Kurs / Lekcja 3</Link></p>
      <p style={{ background: "var(--invert-bg)", padding: 8 }}>
        <Link href="#" wariant="tlo-odwrocone" data-testid="link-tlo-odwrocone">Zakładka wybrana</Link>
      </p>

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

      {/* A13 Skeleton — wariant: wysokość przycisku 34px */}
      <div data-style-id="atom-skeleton-przycisk">
        <Skeleton wariant="przycisk" />
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

      {/* Molekuły warstwy 3, grupa A
          (M1, M2, M3, M4, M7, M8, M9), wpięte w ISTNIEJĄCY poligon zamiast
          osobnego przyrządu — warianty i stany z 06-ATOMY-MOLEKULY-ORGANIZMY.md
          §3, ta sama zasada co §2 (design-system/poligon/pozycje-warianty-stany-par2.mjs). */}

      {/* M1 Field — warianty: pięć rodzajów kontrolki; stany: niepoprawny, obowiązkowy, zablokowany */}
      <div data-style-id="molekula-field-tekst">
        <Field id="m1-tekst" etykieta="Imię" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
      </div>
      <div data-style-id="molekula-field-liczba">
        <Field id="m1-liczba" etykieta="Wiek" rodzaj="liczba" wartosc="" onZmiana={() => {}} />
      </div>
      <div data-style-id="molekula-field-data">
        <Field id="m1-data" etykieta="Data urodzenia" rodzaj="data" wartosc="" onZmiana={() => {}} />
      </div>
      <div data-style-id="molekula-field-wieloliniowy">
        <Field id="m1-opis" etykieta="Opis" rodzaj="wieloliniowy" wartosc="" onZmiana={() => {}} />
      </div>
      <div data-style-id="molekula-field-wybor">
        <Field
          id="m1-wybor"
          etykieta="Rola"
          rodzaj="wybor"
          opcje={[{ wartosc: "a", etykieta: "Wariant A" }, { wartosc: "b", etykieta: "Wariant B" }]}
          wartosc="a"
          onZmiana={() => {}}
        />
      </div>
      <div data-style-id="molekula-field-niepoprawny">
        <Field id="m1-niepoprawny" etykieta="E-mail" rodzaj="tekst" wartosc="" onZmiana={() => {}} blad="Podaj poprawny adres" />
      </div>
      <div data-style-id="molekula-field-wymagane">
        <Field id="m1-wymagane" etykieta="Nazwisko" rodzaj="tekst" wartosc="" onZmiana={() => {}} wymagane />
      </div>
      <div data-style-id="molekula-field-zablokowany">
        <Field id="m1-zablokowany" etykieta="Identyfikator" rodzaj="tekst" wartosc="ABC-1" onZmiana={() => {}} zablokowany />
      </div>

      {/* M2 SearchBox — stany: z wpisem, bez wyników (0 wystąpień w aplikacji) */}
      <div data-style-id="molekula-searchbox-z-wpisem">
        <SearchBox id="m2-a" etykieta="Szukaj kursu" wartosc="jog" onZmiana={() => {}} />
      </div>
      <div data-style-id="molekula-searchbox-bez-wynikow">
        <SearchBox
          id="m2-b"
          etykieta="Szukaj kursu"
          wartosc="zzz"
          onZmiana={() => {}}
          brakWynikow
          tekstBrakuWynikow="Brak wyników. Zmień szukaną frazę."
        />
      </div>

      {/* M3 ListRow — warianty: prosty, ze stanem, rozwijalny, materiał, z licznikiem; stan: otwarty */}
      <div data-style-id="molekula-listrow-prosty">
        <ListRow tytul="Jan Kowalski" akcja={{ etykieta: "Otwórz", href: "#" }} />
      </div>
      <div data-style-id="molekula-listrow-ze-stanem">
        <ListRow
          wariant="ze-stanem"
          tytul="Sprawa 12"
          plakietka={{ wariant: "warn", tekst: "Do decyzji" }}
          akcja={{ etykieta: "Otwórz", href: "#" }}
        />
      </div>
      <div data-style-id="molekula-listrow-rozwijalny">
        <ListRow wariant="rozwijalny" tytul="Temat 1: Wprowadzenie" akcja={{ etykieta: "Rozwiń", onKliknij: () => {} }} />
      </div>
      <div data-style-id="molekula-listrow-material">
        <ListRow wariant="material" tytul="materiał.pdf" akcja={{ etykieta: "Pobierz", href: "#" }} />
      </div>
      <div data-style-id="molekula-listrow-z-licznikiem">
        <ListRow
          wariant="z-licznikiem"
          tytul="Materiały lekcji"
          licznik={{ wartosc: 5, etykieta: "plików" }}
          akcja={{ etykieta: "Pobierz", href: "#" }}
        />
      </div>
      <div data-style-id="molekula-listrow-otwarty">
        <ListRow tytul="Sprawa 9" otwarty akcja={{ etykieta: "Zamknij", onKliknij: () => {} }} />
      </div>

      {/* M4 KeyValueRow — warianty: wartość jawna, zamaskowana */}
      <div data-style-id="molekula-keyvaluerow-jawna">
        <KeyValueRow etykieta="Imię" wartosc="Anna" />
      </div>
      <div data-style-id="molekula-keyvaluerow-zamaskowana">
        <KeyValueRow etykieta="PESEL" wartosc="12345678901" zamaskowana />
      </div>

      {/* M7 Breadcrumbs — warianty: pełne, skrócone (06-ATOMY-MOLEKULY-ORGANIZMY.md w. 147) */}
      <div data-style-id="molekula-breadcrumbs-pelne">
        <Breadcrumbs
          pozycje={[
            { etykieta: "Kursy", href: "#" },
            { etykieta: "Edycja 24", href: "#" },
            { etykieta: "Ustawienia" },
          ]}
        />
      </div>
      <div data-style-id="m7-breadcrumbs-skrocone">
        <Breadcrumbs
          wariant="skrocone"
          pozycje={[
            { etykieta: "Kursy", href: "#" },
            { etykieta: "Edycja 24", href: "#" },
            { etykieta: "Modul 2", href: "#" },
            { etykieta: "Lekcja 5", href: "#" },
            { etykieta: "Ustawienia" },
          ]}
        />
      </div>

      {/* M7 Breadcrumbs — slad CIASNY, wariant "pelne" (nie "skrocone" — "skrocone"
          zwija środek do jednej "…", więc NIGDY nie daje ciasnego rzędu wielu
          sąsiadujących odnośników). Etykiety celowo krótkie (skrót ścieżki
          kurs/poziom/moduł/lekcja na wąskim ekranie) — to jest fixture do
          pomiar-celow-sladu.mjs: reprodukuje realny
          "ciasny ślad" z komentarza w Breadcrumbs.module.css (krótkie
          etykiety, wiele pozycji, odstęp środków < 46px), gdzie szerokość
          `.pozycja > a::after` (100% własnego `<li>`, bez podłogi) może
          zejść poniżej progu 24 px AA 2.5.8 (ślad jest nawigacją zapasową,
          próg 24 px, nie 44 px). 4 pozycje klikalne
          (Kursy/P1/M2/L5) + 1 Text na końcu (Quiz — Breadcrumbs.tsx: ostatnia
          pozycja NIGDY nie jest odnośnikiem, więc nie jest celem dotyku). */}
      <div data-style-id="m7-breadcrumbs-slad-ciasny">
        <Breadcrumbs
          pozycje={[
            { etykieta: "Kursy", href: "#" },
            { etykieta: "P1", href: "#" },
            { etykieta: "M2", href: "#" },
            { etykieta: "L5", href: "#" },
            { etykieta: "Quiz" },
          ]}
        />
      </div>

      {/* M8 Tabs — stany: wybrana, fokus (REGULY_FOKUSU); wariant: zwinięta poniżej
          639 (06-ATOMY-MOLEKULY-ORGANIZMY.md w. 148), własny mount (patrz Tabs.tsx) */}
      <div data-style-id="molekula-tabs">
        <Tabs
          zakladki={[
            { id: "wszystkie", etykieta: "Wszystkie", liczba: 6 },
            { id: "otwarte", etykieta: "Otwarte", liczba: 2 },
          ]}
          wybranaId="wszystkie"
          onWybierz={() => {}}
        />
      </div>
      <div data-style-id="m8-tabs-zwiniete">
        <Tabs
          zwinPonizej639
          zakladki={[
            { id: "wszystkie", etykieta: "Wszystkie", liczba: 6 },
            { id: "otwarte", etykieta: "Otwarte", liczba: 2 },
          ]}
          wybranaId="wszystkie"
          onWybierz={() => {}}
        />
      </div>

      {/* M9 MenuItem/MenuGroup — warianty: bieżąca, linia "W przygotowaniu", nagłówek grupy */}
      <div data-style-id="molekula-menugroup">
        <MenuGroup
          naglowek="Program"
          pozycje={[
            { ikona: "home", etykieta: "Pulpit", href: "#", biezaca: true },
            { ikona: "book", etykieta: "Kursy", href: "#" },
          ]}
          wPrzygotowaniu={["Eksport PDF"]}
        />
      </div>

      {/* --- Warstwa 3, grupa C: M14-M19, wg kolumny "Z czego, warianty, stany"
          §3 06-ATOMY-MOLEKULY-ORGANIZMY.md. Dołączone do TEGO SAMEGO poligonu
          (grupa C) zamiast osobnego narzędzia — rozstrzygnięcie
          specyfikacji: przyrząd istnieje od warstwy 2, molekuły mają do niego
          wejść. */}

      {/* M14 Pagination — 0 pozycji nazwanych w kolumnie "Z czego, warianty,
          stany" (w. 154: "Button x2 + Text", sam skład, bez wypisanych
          wariantów/stanów) — zmontowana mimo to, bo ma mierzalny wymiar w
          kolumnie "Wymiary" ("pola ≥ 44 px"); wpis w cele-atomy-styl.mjs jest
          __pomocniczy_wymiar i NIE liczy się do mianownika POZYCJE_PAR2,
          dokładnie jak pole dotyku A6 Checkbox. */}
      <div data-style-id="m14-pagination">
        <Pagination strona={3} stron={7} naPoprzednia={() => {}} naNastepna={() => {}} />
      </div>

      {/* M15 Toast — warianty: bez akcji (znika po 8s), z akcją (czeka),
          z odnośnikiem do dziennika. Wszystkie trzy mounty naraz nachodzą na
          siebie wizualnie (position: fixed) — bez znaczenia dla pomiaru
          stylu obliczonego, który czyta właściwości niezależnie od nakładania. */}
      <div data-style-id="m15-toast-bez-akcji">
        <Toast komunikat="Zapisano zmiany." onZamknij={() => {}} />
      </div>
      <div data-style-id="m15-toast-z-akcja">
        <Toast komunikat="Usunięto wiersz." onCofnij={() => {}} onZamknij={() => {}} />
      </div>
      <div data-style-id="m15-toast-z-odnosnikiem">
        <Toast
          komunikat="Zapisano w dzienniku."
          onZamknij={() => {}}
          odnosnikDziennika={{ href: "#", etykieta: "Zobacz w dzienniku" }}
        />
      </div>

      {/* M16 CollapsibleSection — stany: zwinięta, rozwinięta (akcje na TYM
          SAMYM mouncie, idempotentne — kolejność wpisów w rejestrze bez
          znaczenia, tak jak A5 Select), fokus (REGULY_FOKUSU). */}
      <div data-style-id="m16-collapsible">
        <CollapsibleSection tytul="Materiały" liczba={4} dzieci={<Text>Treść sekcji.</Text>} />
      </div>

      {/* M17 EmptyState — warianty: pusto, brak uprawnień, brak wyników filtra */}
      <div data-style-id="m17-pusto">
        <EmptyState
          naglowek="Brak danych"
          tresc="Dane pojawią się po pierwszym zapisie."
          przycisk={{ etykieta: "Dodaj", onClick: () => {} }}
        />
      </div>
      <div data-style-id="m17-brak-uprawnien">
        <EmptyState
          naglowek="Brak dostępu"
          wariant="brak-uprawnien"
          rola="administratora"
          przycisk={{ etykieta: "Wróć", onClick: () => {} }}
        />
      </div>
      <div data-style-id="m17-brak-wynikow-filtra">
        <EmptyState
          naglowek="Brak wyników"
          wariant="brak-wynikow-filtra"
          tresc="Żaden wynik nie pasuje do filtra."
          przycisk={{ etykieta: "Wyczyść filtr", onClick: () => {} }}
        />
      </div>

      {/* M18 RichTextEditor — stany: fokus w pojemniku (klik na przycisk paska,
          :focus-within na kontenerze), fokus w treści (REGULY_FOKUSU, obszar
          edytowalny) */}
      <div data-style-id="m18-richtext">
        <RichTextEditor
          etykieta="Treść lekcji"
          wartoscHtml="<p>Przykładowa treść.</p>"
          onZmiana={() => {}}
          onAkcja={() => {}}
        />
      </div>

      {/* M19 QaBlock — stany: odpowiedziana, czeka */}
      <div data-style-id="m19-odpowiedziana">
        <QaBlock
          pytanie="Czy termin można przesunąć?"
          stan="odpowiedziana"
          kto="Prowadząca"
          kiedy="wczoraj"
          odpowiedz="Tak, napisz do mnie."
        />
      </div>
      <div data-style-id="m19-czeka">
        <QaBlock
          pytanie="Ile trwa superwizja?"
          stan="czeka"
          obiecanyCzas="jutra"
          poPrzekroczeniu="Zobaczysz przypomnienie w dzienniku."
        />
      </div>

      {/* O7 PublishChecklist — jedyny organizm złożony wprost z atomów (§4, w. 171).
          Korekta: "bez braków" ZDJĘTE z mianownika — po poprawce
          składu (Text usunięty, "zamyka się sam" zaimplementowane jako
          `return null` w komponencie) ten stan nie rysuje już żadnego stylu
          do zmierzenia, więc nie jest pozycją stylu obliczonego. Jeden mount
          zostaje: "z brakami" (lista + plakietka + zamknięcie + fokus). */}
      <div data-style-id="organizm-o7-z-brakami">
        <PublishChecklist
          tytul="Braki przed publikacją"
          braki={[
            { id: "opis", tekst: "Brak opisu kursu", href: "#opis" },
            { id: "lekcje", tekst: "Brak lekcji w kursie", href: "#lekcje" },
          ]}
          gotowe={[{ id: "materialy", tekst: "Materiały dodane (3)" }]}
          onZamknij={() => {}}
        />
      </div>

      {/* M5 FileDropZone — stan: po dodaniu (drugi mount, niepusta lista
          plików); fokus (akcja na [role="button"], patrz REGULY_FOKUSU w
          cele-atomy-styl.mjs). "nad obszarem" jest GAPEM jawnym w
          pozycje-warianty-stany-par2.mjs — wymaga symulacji dragover, poza
          zestawem akcji silnika (hover/klik/otworz-jesli.../zamknij-jesli...). */}
      <div data-style-id="m5-filedropzone">
        <FileDropZone
          id="m5-plik"
          etykieta="Przeciągnij plik albo wybierz z dysku"
          podpowiedz="PDF, JPG, PNG do 10 MB"
          pliki={[]}
          onWybierzPliki={() => {}}
        />
      </div>
      <div data-style-id="m5-filedropzone-po-dodaniu">
        <FileDropZone
          id="m5-plik-dodany"
          etykieta="Przeciągnij plik albo wybierz z dysku"
          podpowiedz="PDF, JPG, PNG do 10 MB"
          pliki={[{ nazwa: "zaswiadczenie.pdf", stan: "gotowy", komunikat: "Gotowy" }]}
          onWybierzPliki={() => {}}
        />
      </div>

      {/* M6 FileRow — warianty: przetwarzanie, gotowy, błąd */}
      <ul data-style-id="m6-filerow-przetwarzanie">
        <FileRow nazwa="dowod.pdf" stan="przetwarzanie" komunikat="Przetwarzanie…" />
      </ul>
      <ul data-style-id="m6-filerow-gotowy">
        <FileRow nazwa="zdjecie.png" stan="gotowy" komunikat="Gotowy" />
      </ul>
      <ul data-style-id="m6-filerow-blad">
        <FileRow nazwa="skan.jpg" stan="blad" komunikat="Plik za duży (maks. 10 MB)" />
      </ul>

      {/* M10 StatTile — warianty: zwykły, dominujący, bez danych */}
      <div data-style-id="m10-stattile-zwykly">
        <StatTile id="m10-zwykly" etykieta="Zaliczone testy" wartosc={18} mianownik="z 72 godzin" />
      </div>
      <div data-style-id="m10-stattile-dominujacy">
        <StatTile id="m10-dominujacy" etykieta="Postęp programu" wartosc={62} mianownik="%" dominujacy />
      </div>
      <div data-style-id="m10-stattile-brak">
        <StatTile id="m10-brak" etykieta="Ocena" mianownik="w skali 100" />
      </div>

      {/* M11 Notice — warianty: ok, warn, error, info. Mount tutaj mierzy
          STYL (zgodność z §3, tokeny), nie jest "użyciem" w sensie ekranu
          aplikacji — realne użycie `info` na ekranie nadal wynosi 0.
          Poligon mierzy WSZYSTKIE warianty każdego
          atomu bez względu na to, czy ekran już z nich korzysta (tak samo
          jak np. A1 Button "danger" wyżej). */}
      <div data-style-id="m11-notice-ok">
        <Notice wariant="ok" tytul="Zapisano">Zmiany zostały zapisane.</Notice>
      </div>
      <div data-style-id="m11-notice-warn">
        <Notice wariant="warn" tytul="Sprawdź dane">Numer telefonu wygląda niepoprawnie.</Notice>
      </div>
      <div data-style-id="m11-notice-error">
        <Notice wariant="error" tytul="Nie udało się zapisać">Sprawdź połączenie i spróbuj ponownie.</Notice>
      </div>
      <div data-style-id="m11-notice-info">
        <Notice wariant="info" tytul="Informacja">Nowa funkcja jest dostępna od tego tygodnia.</Notice>
      </div>

      {/* M12 DialogActions — "fokus początkowy na wycofaniu" jest GAPEM
          jawnym: fokus DOM jest stanem globalnym jednej strony, a inne
          pozycje poligonu (np. akcje "klik" A5 Select) przenoszą fokus
          gdzie indziej, zanim przyszłaby kolej na odczyt tej pozycji. */}
      <div data-style-id="m12-dialogactions">
        <DialogActions
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zapisz"
          onWycofaj={() => {}}
          onPotwierdz={() => {}}
        />
      </div>

      {/* M13 SaveBar — stan: widoczny. "ukryty" (liczbaZmian=0, komponent
          renderuje null) jest GAPEM jawnym: silnik pomiaru wymaga ISTNIENIA
          elementu pod selektorem (0 dopasowań = kod 2 "nie da się
          zmierzyć") i nie ma dziś sposobu potwierdzenia NIEOBECNOŚCI
          elementu jako wyniku POPRAWNEGO. */}
      <div data-style-id="m13-savebar-widoczny">
        <SaveBar
          liczbaZmian={2}
          temat="Zmieniono dane profilu"
          onCofnij={() => {}}
          onPorzucWszystko={() => {}}
          onZapisz={() => {}}
        />
      </div>

      {/* O1 PageHeader — warianty: okruszki pełne (z opisem),
          okruszki skrócone (z plakietką statusu i odnośnikiem pobocznym).
          Przycisk powrotu ma pole dotyku ≥44px wbudowane w atom `Button`
          (`.przycisk { min-height: var(--hit-min) }`) — ten sam atom, który
          poligon atomów już mierzy jako "Button outline" w A1. */}
      <div data-style-id="o1-pageheader-pelne">
        <PageHeader
          okruszki={[
            { etykieta: "Osoby", href: "#" },
            { etykieta: "Anna Kowalska", href: "#" },
            { etykieta: "Źródła liczb" },
          ]}
          tytul="Źródła liczb — Anna Kowalska"
          opis="Skąd biorą się liczby z karty osoby."
          onPowrot={() => {}}
        />
      </div>
      <div data-style-id="o1-pageheader-skrocone-status">
        <PageHeader
          okruszki={[
            { etykieta: "Kursy", href: "#" },
            { etykieta: "Edycja 24", href: "#" },
            { etykieta: "Moduł 2", href: "#" },
            { etykieta: "Lekcja 5", href: "#" },
            { etykieta: "Ustawienia" },
          ]}
          wariantOkruszkow="skrocone"
          tytul="Ustawienia lekcji"
          status={{ wariant: "warn", etykieta: "Wersja robocza" }}
          akcja={{ etykieta: "Zobacz dokumentację", href: "#" }}
          onPowrot={() => {}}
        />
      </div>

      {/* O2 PanelNav — 3 zestawy wg roli (64 ekrany, 3 zestawy). Treść
          zestawu (który grupy/pozycje) ustala wywołujący —
          tu trzy różne wartości `grupy` pokazują trzy role osobno. */}
      <div data-style-id="o2-panelnav-podopieczny">
        <PanelNav
          uzytkownik={{ imie: "Anna", nazwisko: "Kowalska", rola: "Podopieczny" }}
          grupy={[
            {
              naglowek: "Program",
              pozycje: [
                { ikona: "home", etykieta: "Pulpit", href: "#", biezaca: true },
                { ikona: "book", etykieta: "Kursy", href: "#" },
                { ikona: "clock", etykieta: "Dziennik", href: "#", licznik: { wartosc: 3, etykieta: "nowe" } },
              ],
              wPrzygotowaniu: ["Eksport PDF"],
            },
          ]}
        />
      </div>
      <div data-style-id="o2-panelnav-terapeuta">
        <PanelNav
          uzytkownik={{ imie: "Piotr", nazwisko: "Nowak", rola: "Terapeuta" }}
          grupy={[
            {
              naglowek: "Osoby",
              pozycje: [
                { ikona: "users", etykieta: "Podopieczni", href: "#", biezaca: true },
                { ikona: "chat", etykieta: "Pytania", href: "#", licznik: { wartosc: 2, etykieta: "czeka" } },
              ],
            },
            {
              naglowek: "Superwizje",
              pozycje: [{ ikona: "award", etykieta: "Terminy", href: "#" }],
            },
          ]}
        />
      </div>
      <div data-style-id="o2-panelnav-admin">
        <PanelNav
          uzytkownik={{ imie: "Ola", nazwisko: "Zych", rola: "Administrator" }}
          grupy={[
            {
              naglowek: "Zarządzanie",
              pozycje: [
                { ikona: "users", etykieta: "Wszystkie osoby", href: "#" },
                { ikona: "chart", etykieta: "Raporty", href: "#" },
                { ikona: "cog", etykieta: "Ustawienia", href: "#", biezaca: true },
              ],
            },
          ]}
        />
      </div>

      {/* O10 StatRow (w4) — warianty: zwykły (bez odnośników), odnośnikowy
          (każdy kafel = `Link` do sekcji źródeł, D-106 "karta linkuje z
          każdej liczby", użyty na T3). Kafel "bez danych" pokazuje stan
          braku wartości dziedziczony z `StatTile`. */}
      <div data-style-id="o10-statrow-zwykly">
        <StatRow
          kafle={[
            { id: "o10-godziny", etykieta: "Godziny przyjęte", wartosc: 42, mianownik: "godz." },
            { id: "o10-superwizje", etykieta: "Obecności na superwizjach", wartosc: 6, mianownik: "z 8" },
            { id: "o10-ocena", etykieta: "Rzetelność", mianownik: "w skali 100" },
          ]}
        />
      </div>
      <div data-style-id="o10-statrow-odnosnikowy">
        <StatRow
          kafle={[
            { id: "o10-l-godziny", etykieta: "Godziny przyjęte", wartosc: 42, mianownik: "godz.", href: "#godziny" },
            {
              id: "o10-l-superwizje",
              etykieta: "Obecności na superwizjach",
              wartosc: 6,
              mianownik: "z 8",
              href: "#superwizje",
            },
            { id: "o10-l-warsztat", etykieta: "Warsztat", wartosc: 3, mianownik: "z 4", href: "#warsztat" },
            {
              id: "o10-l-testy",
              etykieta: "Testy ścieżki",
              wartosc: 18,
              mianownik: "z 24 zaliczonych",
              procent: 75,
              href: "#testy",
            },
            {
              id: "o10-l-czas",
              etykieta: "Czas nauki",
              wartosc: 120,
              mianownik: "godz.",
              dominujacy: true,
              href: "#czas",
            },
          ]}
        />
      </div>

      {/* O4 RecordList — warianty/stany: z wierszami (lista + suma w stopce),
          pusty (EmptyState, ZERO wierszy). Składa 5 sekcji ekranu T3 „źródła
          liczb osoby” (KARTA-EKRANU-T3-ZRODLA-LICZB-OSOBY) — tu zmontowany
          jako pojedynczy organizm, nie cała strona T3. */}
      <div data-style-id="organizm-o4-z-wierszami">
        <RecordList
          tytul="Godziny przyjęte"
          jednostkaSumy="godzin"
          wiersze={[
            { id: "r1", tytul: "12.01.2026 — sesja indywidualna", podpowiedz: "Źródło: dziennik", wartosc: 2, akcja: { etykieta: "Otwórz", href: "#" } },
            { id: "r2", tytul: "15.01.2026 — konsultacja", plakietka: { wariant: "ok", tekst: "Zatwierdzone" }, wartosc: 1, akcja: { etykieta: "Otwórz", href: "#" } },
            { id: "r3", tytul: "20.01.2026 — sesja grupowa", plakietka: { wariant: "pending", tekst: "Do weryfikacji" }, wartosc: 3, akcja: { etykieta: "Otwórz", href: "#" } },
          ]}
          pusty={{ naglowek: "Brak godzin", tresc: "Godziny pojawią się po pierwszym wpisie w dzienniku.", przycisk: { etykieta: "Dodaj wpis", onClick: () => {} } }}
        />
      </div>
      <div data-style-id="organizm-o4-pusty">
        <RecordList
          tytul="Obecności na superwizjach"
          jednostkaSumy="godzin"
          wiersze={[]}
          pusty={{ naglowek: "Brak obecności", tresc: "Obecności pojawią się po pierwszej zarejestrowanej superwizji.", przycisk: { etykieta: "Zarejestruj", onClick: () => {} } }}
        />
      </div>

      {/* O5 CaseCard — 6 RODZAJÓW (strukturalne warianty składu, patrz
          komentarz przy `RodzajCaseCard` w CaseCard.tsx). */}
      <div data-style-id="organizm-o5-podstawowa">
        <CaseCard
          rodzaj="podstawowa"
          tytul="Sprawa 14 — wniosek o certyfikat"
          pary={[
            { etykieta: "Status", wartosc: "Otwarta" },
            { etykieta: "Opiekun", wartosc: "Anna Kowalska" },
          ]}
        />
      </div>
      <div data-style-id="organizm-o5-ze-statystyka">
        <CaseCard
          rodzaj="ze-statystyka"
          tytul="Sprawa 15 — korekta danych"
          pary={[{ etykieta: "Status", wartosc: "W toku" }]}
          statystyka={{ id: "o5-stat-1", etykieta: "Dni otwarta", wartosc: 4, mianownik: "dni" }}
        />
      </div>
      <div data-style-id="organizm-o5-z-postepem">
        <CaseCard
          rodzaj="z-postepem"
          tytul="Sprawa 16 — audyt superwizji"
          pary={[{ etykieta: "Status", wartosc: "W realizacji" }]}
          postep={{ procent: 60, etykieta: "6 z 10 kroków" }}
        />
      </div>
      <div data-style-id="organizm-o5-pelna">
        <CaseCard
          rodzaj="pelna"
          tytul="Sprawa 17 — eskalacja"
          pary={[
            { etykieta: "Status", wartosc: "Eskalowana" },
            { etykieta: "Priorytet", wartosc: "Wysoki" },
          ]}
          statystyka={{ id: "o5-stat-2", etykieta: "Postęp programu", wartosc: 62, mianownik: "%", procent: 62 }}
          postep={{ procent: 30, etykieta: "3 z 10 dni do terminu", wariant: "odtwarzacz" }}
        />
      </div>
      <div data-style-id="organizm-o5-zamaskowana">
        <CaseCard
          rodzaj="zamaskowana"
          tytul="Sprawa 18 — dane osobowe"
          pary={[{ etykieta: "PESEL", wartosc: "12345678901", zamaskowana: true }]}
          statystyka={{ id: "o5-stat-3", etykieta: "Zaliczone testy", wartosc: 18, mianownik: "z 72 godzin" }}
        />
      </div>
      <div data-style-id="organizm-o5-bez-danych">
        <CaseCard
          rodzaj="bez-danych"
          tytul="Sprawa 19 — nowa"
          pary={[{ etykieta: "Status", wartosc: "Nowa" }]}
          statystyka={{ id: "o5-stat-4", etykieta: "Ocena", mianownik: "w skali 100" }}
        />
      </div>

      {/* O3 DataTable — 5 UŻYĆ: pełna (szeroka, ze stronicowaniem), wąska
          (opakowanie zawężające szerokość, żeby pokazać zamianę na
          pary/karty poniżej 639px — patrz DataTable.module.css), pusta (0
          wierszy po filtrze), bez stronicowania (mało wierszy), z wieloma
          kolumnami liczbowymi (`Num` × 2). */}
      <div data-style-id="organizm-o3-pelna">
        <DataTable
          tytul="Uczestnicy kursu"
          kolumny={[
            { klucz: "imie", etykieta: "Imię i nazwisko" },
            { klucz: "godziny", etykieta: "Godziny", liczbowa: true, jednostka: "godz." },
          ]}
          wiersze={[
            { id: "u1", wartosci: { imie: "Jan Kowalski", godziny: 12 } },
            { id: "u2", wartosci: { imie: "Anna Nowak", godziny: 8 } },
          ]}
          szukajka={{ id: "o3-szukaj-1", etykieta: "Szukaj uczestnika", wartosc: "", onZmiana: () => {} }}
          stronicowanie={{ strona: 1, stron: 3, naPoprzednia: () => {}, naNastepna: () => {} }}
        />
      </div>
      <div data-style-id="organizm-o3-waska" style={{ maxWidth: 320 }}>
        <DataTable
          tytul="Uczestnicy kursu (widok wąski)"
          kolumny={[
            { klucz: "imie", etykieta: "Imię i nazwisko" },
            { klucz: "godziny", etykieta: "Godziny", liczbowa: true, jednostka: "godz." },
          ]}
          wiersze={[{ id: "u3", wartosci: { imie: "Piotr Wiśniewski", godziny: 5 } }]}
          szukajka={{ id: "o3-szukaj-2", etykieta: "Szukaj uczestnika", wartosc: "", onZmiana: () => {} }}
        />
      </div>
      <div data-style-id="organizm-o3-pusta">
        <DataTable
          tytul="Uczestnicy kursu (brak wyników)"
          kolumny={[{ klucz: "imie", etykieta: "Imię i nazwisko" }]}
          wiersze={[]}
          szukajka={{ id: "o3-szukaj-3", etykieta: "Szukaj uczestnika", wartosc: "zzz", onZmiana: () => {} }}
        />
      </div>
      <div data-style-id="organizm-o3-bez-stronicowania">
        <DataTable
          tytul="Materiały lekcji"
          kolumny={[{ klucz: "nazwa", etykieta: "Nazwa pliku" }]}
          wiersze={[{ id: "m1", wartosci: { nazwa: "materiał.pdf" } }]}
          szukajka={{ id: "o3-szukaj-4", etykieta: "Szukaj materiału", wartosc: "", onZmiana: () => {} }}
        />
      </div>
      <div data-style-id="organizm-o3-liczby">
        <DataTable
          tytul="Postępy uczestników"
          kolumny={[
            { klucz: "imie", etykieta: "Imię i nazwisko" },
            { klucz: "godziny", etykieta: "Godziny", liczbowa: true, jednostka: "godz." },
            { klucz: "testy", etykieta: "Testy zaliczone", liczbowa: true, jednostka: "z 24" },
          ]}
          wiersze={[{ id: "p1", wartosci: { imie: "Ewa Zielińska", godziny: 20, testy: 18 } }]}
          szukajka={{ id: "o3-szukaj-5", etykieta: "Szukaj uczestnika", wartosc: "", onZmiana: () => {} }}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Poligon />);
