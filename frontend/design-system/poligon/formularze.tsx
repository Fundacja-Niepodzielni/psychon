import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Text } from "../atomy/Text/Text";
import { Button } from "../atomy/Button/Button";
import { Toast } from "../molekuly/Toast/Toast";
import { Field } from "../molekuly/Field/Field";
import { Dialog } from "../organizmy/Dialog/Dialog";
import { FormSection, type PoleFormSection } from "../organizmy/FormSection/FormSection";
import { JournalTable, type FiltrJournalTable } from "../organizmy/JournalTable/JournalTable";
import type { WierszDataTable } from "../organizmy/DataTable/DataTable";

// Motyw sterowany parametrem ?theme=dark|light, tym samym sposobem co
// design-system/poligon/main.tsx (nietknięty przez tę zmianę), żeby
// Playwright mógł go ustawić przed pomiarem bez dotykania localStorage.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
// Bez parametru poligon jest jasny (MVP tylko jasny): arkusz tokenów działa
// wyłącznie pod elementem z `data-theme`, więc atrybut jest ustawiany zawsze.
document.documentElement.setAttribute("data-theme", motyw === "dark" ? "dark" : "light");

/**
 * Poligon wariantów i stanów trzech organizmów formularzy i dziennika —
 * `Dialog`, `FormSection`, `JournalTable`. Plik NOWY, osobny od
 * `design-system/poligon/main.tsx` i `lekcja.tsx` (oba nietknięte przez tę
 * zmianę). Strona jest trzecim wejściem budowy poligonu
 * (`vite.config.poligon.ts`) i jest wpięta w rejestr `cele-oczekiwane.mjs`
 * oraz w `pomiar-celow-dotyku.mjs` (pole `strona: "formularze.html"`) —
 * `npm run pomiar:cele-dotyku` mierzy tę stronę tym samym przyrządem, co
 * pozostałe dwie.
 */
function PoligonFormularze() {
  const [otwartyDialogPytanie, setOtwartyDialogPytanie] = useState(false);
  const [otwartyDialogUsun, setOtwartyDialogUsun] = useState(false);
  const [otwartyDialogPole, setOtwartyDialogPole] = useState(false);
  const [otwartyDialogLadowanie, setOtwartyDialogLadowanie] = useState(false);
  const [powodOdrzucenia, setPowodOdrzucenia] = useState("");

  const [poleImie, setPoleImie] = useState("");
  const [poleOpis, setPoleOpis] = useState("");
  const [zapisanoWidoczny, setZapisanoWidoczny] = useState(false);

  const polaBezBledow: PoleFormSection[] = [
    { id: "fs-imie", etykieta: "Imię", rodzaj: "tekst", wartosc: poleImie, onZmiana: setPoleImie, wymagane: true },
    { id: "fs-nazwisko", etykieta: "Nazwisko", rodzaj: "tekst", wartosc: "", onZmiana: () => {} },
    { id: "fs-email", etykieta: "E-mail", rodzaj: "tekst", wartosc: "", onZmiana: () => {} },
  ];

  const polaZBledami: PoleFormSection[] = [
    { id: "fs-b-imie", etykieta: "Imię", rodzaj: "tekst", wartosc: "", onZmiana: () => {}, blad: "Podaj imię" },
    {
      id: "fs-b-email",
      etykieta: "E-mail",
      rodzaj: "tekst",
      wartosc: "zle",
      onZmiana: () => {},
      blad: "Podaj poprawny adres e-mail",
    },
    { id: "fs-b-telefon", etykieta: "Telefon", rodzaj: "tekst", wartosc: "", onZmiana: () => {} },
  ];

  const polaSiedem: PoleFormSection[] = Array.from({ length: 7 }, (_, indeks) => ({
    id: `fs-siedem-${indeks}`,
    etykieta: `Pole ${indeks + 1}`,
    rodzaj: "tekst" as const,
    wartosc: "",
    onZmiana: () => {},
  }));

  const polaZDanymi: PoleFormSection[] = [
    { id: "fs-d-imie", etykieta: "Imię", rodzaj: "tekst", wartosc: "Anna", onZmiana: () => {} },
    { id: "fs-d-nazwisko", etykieta: "Nazwisko", rodzaj: "tekst", wartosc: "Kowalska", onZmiana: () => {} },
    {
      id: "fs-d-email",
      etykieta: "E-mail",
      rodzaj: "tekst",
      wartosc: "anna.kowalska@przyklad.pl",
      onZmiana: () => {},
    },
    { id: "fs-d-telefon", etykieta: "Telefon", rodzaj: "tekst", wartosc: "600 100 200", onZmiana: () => {} },
  ];

  const polaLadowanie: PoleFormSection[] = [
    { id: "fs-lad-imie", etykieta: "Imię", rodzaj: "tekst", wartosc: "Anna", onZmiana: () => {}, zablokowany: true },
    {
      id: "fs-lad-email",
      etykieta: "E-mail",
      rodzaj: "tekst",
      wartosc: "anna.kowalska@przyklad.pl",
      onZmiana: () => {},
      zablokowany: true,
    },
  ];

  const [wierszBiezacejSesji, setWierszBiezacejSesji] = useState<WierszDataTable | null>(null);

  const [filtrRodzaju, setFiltrRodzaju] = useState("wszystkie");
  const filtry: FiltrJournalTable[] = [
    {
      id: "jt-rodzaj",
      etykieta: "Rodzaj zdarzenia",
      rodzaj: "wybor",
      opcje: [
        { wartosc: "wszystkie", etykieta: "Wszystkie" },
        { wartosc: "internship", etykieta: "Staż" },
        { wartosc: "legal_document", etykieta: "Dokumenty prawne" },
      ],
      wartosc: filtrRodzaju,
      onZmiana: setFiltrRodzaju,
    },
  ];

  const wierszeDziennikaBazowe =
    filtrRodzaju === "internship"
      ? [
          { id: "z1", wartosci: { zdarzenie: "Zatwierdzenie dyżuru z 22 września", kto: "Anna Kowalska", kiedy: "22.09.2026" } },
        ]
      : filtrRodzaju === "legal_document"
        ? []
        : [
            { id: "z1", wartosci: { zdarzenie: "Zatwierdzenie dyżuru z 22 września", kto: "Anna Kowalska", kiedy: "22.09.2026" } },
            { id: "z2", wartosci: { zdarzenie: "Odesłanie wpisu z 20 września", kto: "Piotr Nowak", kiedy: "20.09.2026" } },
          ];

  // Stan "po dołożeniu wiersza z bieżącej sesji" — wiersz sesyjny dochodzi na
  // końcu listy ZAWSZE, niezależnie od wybranego filtra: ten poligon nie
  // filtruje wiersza sesyjnego po jego rodzaju. Zmierzone wprost: przy
  // filtrze "Dokumenty prawne" (który w tej próbce nie ma własnych
  // zdarzeń) wiersz sesyjny i tak się pojawia, a licznik rośnie z 0 do 1.
  const wierszeDziennika = wierszBiezacejSesji
    ? [...wierszeDziennikaBazowe, wierszBiezacejSesji]
    : wierszeDziennikaBazowe;

  const kolumnyDziennika = [
    { klucz: "zdarzenie", etykieta: "Zdarzenie" },
    { klucz: "kto", etykieta: "Kto" },
    { klucz: "kiedy", etykieta: "Kiedy" },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
      <p>
        Poligon pomiarowy — warianty i stany organizmów Dialog, FormSection i
        JournalTable — nie jest stroną produktu, tylko narzędziem pomiarowym.
      </p>

      {/* Dialog — warianty treści: Text (pytanie krótkie), Field (pole
          z błędem walidacji); stany: potwierdzenie zwykłe, potwierdzenie
          destrukcyjne, zapisywanie w toku. */}
      <section data-style-id="o8-dialog-wywolania">
        <Text>Dialog — przyciski otwierające warianty:</Text>
        <Button poziom="outline" onClick={() => setOtwartyDialogPytanie(true)}>
          Otwórz: krótkie pytanie (Text)
        </Button>{" "}
        <Button poziom="outline" onClick={() => setOtwartyDialogUsun(true)}>
          Otwórz: potwierdzenie usunięcia (destrukcyjne)
        </Button>{" "}
        <Button poziom="outline" onClick={() => setOtwartyDialogPole(true)}>
          Otwórz: pole z błędem (Field)
        </Button>{" "}
        <Button poziom="outline" onClick={() => setOtwartyDialogLadowanie(true)}>
          Otwórz: zapisywanie w toku
        </Button>
      </section>

      {otwartyDialogPytanie && (
        <div data-style-id="o8-dialog-pytanie">
          <Dialog
            tytul="Wypisać się z terminu?"
            etykietaWycofania="Zostań zapisana"
            etykietaPotwierdzenia="Wypisz mnie"
            onWycofaj={() => setOtwartyDialogPytanie(false)}
            onPotwierdz={() => setOtwartyDialogPytanie(false)}
          >
            <Text>Zwolnisz miejsce dla kogoś innego. Możesz zapisać się ponownie, jeśli zostaną wolne miejsca.</Text>
          </Dialog>
        </div>
      )}

      {otwartyDialogUsun && (
        <div data-style-id="o8-dialog-destrukcyjne">
          <Dialog
            tytul="Usunąć wersję roboczą?"
            etykietaWycofania="Anuluj"
            etykietaPotwierdzenia="Usuń wersję"
            niebezpieczne
            onWycofaj={() => setOtwartyDialogUsun(false)}
            onPotwierdz={() => setOtwartyDialogUsun(false)}
          >
            <Text>Tej operacji nie można cofnąć. Treść wersji roboczej zniknie bezpowrotnie.</Text>
          </Dialog>
        </div>
      )}

      {/* Stan z polem: `Field` jako treść okna, z błędem widocznym od razu —
          demonstruje jednocześnie wariant treści "Field" i stan błędu
          organizmu Dialog. */}
      {otwartyDialogPole && (
        <div data-style-id="o8-dialog-pole-z-bledem">
          <Dialog
            tytul="Podaj powód odrzucenia"
            etykietaWycofania="Anuluj"
            etykietaPotwierdzenia="Odrzuć"
            niebezpieczne
            onWycofaj={() => setOtwartyDialogPole(false)}
            onPotwierdz={() => setOtwartyDialogPole(false)}
          >
            <Field
              id="d-powod"
              etykieta="Powód odrzucenia"
              rodzaj="wieloliniowy"
              wartosc={powodOdrzucenia}
              onZmiana={setPowodOdrzucenia}
              blad={powodOdrzucenia.trim() === "" ? "Podaj powód odrzucenia" : undefined}
            />
          </Dialog>
        </div>
      )}

      {/* Stan ładowania: potwierdzenie zmienia etykietę na "Zapisywanie…" —
          organizm Dialog nie zna sam pojęcia ładowania, więc stan demonstruje
          się przez treść i etykiety przekazane przez wywołującego. */}
      {otwartyDialogLadowanie && (
        <div data-style-id="o8-dialog-ladowanie">
          <Dialog
            tytul="Zapisywanie zmian"
            etykietaWycofania="Anuluj"
            etykietaPotwierdzenia="Zapisywanie…"
            onWycofaj={() => setOtwartyDialogLadowanie(false)}
            onPotwierdz={() => {}}
          >
            <Text>Trwa zapisywanie zmian. Poczekaj chwilę.</Text>
          </Dialog>
        </div>
      )}

      {/* FormSection — warianty: bez błędów (≤5 pól), z błędami (podsumowanie
          + błąd przy polu), z siedmioma polami (2 za rozwinięciem), z danymi
          (pola wypełnione), ładowanie (pola zablokowane, zapis w toku),
          szerokość "lekcja" (760px). */}
      <div data-style-id="o11-formsection-bez-bledow">
        <FormSection
          tytul="Dane kontaktowe"
          pola={polaBezBledow}
          onAnuluj={() => {}}
          onZapisz={() => setZapisanoWidoczny(true)}
        />
      </div>

      {/* Stan "zapisano" — powiadomienie Toast po zapisie, ekran NIE wraca
          na górę (FormSection sam nie przenosi fokusu przy zmianie tego
          stanu — patrz dokumentacja funkcji w FormSection.tsx). */}
      {zapisanoWidoczny && (
        <div data-style-id="o11-formsection-zapisano">
          <Toast komunikat="Zapisano zmiany." onZamknij={() => setZapisanoWidoczny(false)} />
        </div>
      )}

      <div data-style-id="o11-formsection-z-bledami">
        <FormSection
          tytul="Dane kontaktowe (po nieudanej próbie zapisu)"
          pola={polaZBledami}
          onAnuluj={() => {}}
          onZapisz={() => {}}
        />
      </div>

      <div data-style-id="o11-formsection-siedem-pol">
        <FormSection
          tytul="Zgłoszenie wpisu do dziennika"
          pola={polaSiedem}
          tytulDodatkowych="Dodatkowe informacje"
          onAnuluj={() => {}}
          onZapisz={() => {}}
        />
      </div>

      <div data-style-id="o11-formsection-z-danymi">
        <FormSection
          tytul="Dane kontaktowe (wypełnione)"
          pola={polaZDanymi}
          onAnuluj={() => {}}
          onZapisz={() => {}}
        />
      </div>

      <div data-style-id="o11-formsection-ladowanie">
        <FormSection
          tytul="Dane kontaktowe (zapisywanie w toku)"
          pola={polaLadowanie}
          etykietaZapisz="Zapisywanie…"
          onAnuluj={() => {}}
          onZapisz={() => {}}
        />
      </div>

      <div data-style-id="o11-formsection-szerokosc-lekcja">
        <FormSection
          tytul="Pytanie do prowadzącej (szerokość lekcji)"
          pola={[
            { id: "fs-l-opis", etykieta: "Treść pytania", rodzaj: "wieloliniowy", wartosc: poleOpis, onZmiana: setPoleOpis },
          ]}
          szerokosc="lekcja"
          onAnuluj={() => {}}
          onZapisz={() => {}}
        />
      </div>

      {/* JournalTable — stany: domyślny (dwa zdarzenia), pusty wybór (filtr
          "Dokumenty prawne" nie ma zdarzeń w tej próbce), po dołożeniu
          wiersza z bieżącej sesji (przycisk niżej), błąd wczytania, wczytywanie
          w toku, z odnośnikiem pobrania w nagłówku. Filtr sterowany jednym
          stanem powyżej — zmiana widoczna naraz w liczniku i w tabeli (to samo
          źródło `wierszeDziennika`). */}
      <div data-style-id="o9-journaltable">
        <Button
          poziom="outline"
          onClick={() =>
            setWierszBiezacejSesji({
              id: "sesja-1",
              wartosci: { zdarzenie: "Wgląd w dane z bieżącej sesji", kto: "Ty", kiedy: "dziś" },
            })
          }
        >
          Dołóż wiersz z bieżącej sesji
        </Button>
        <JournalTable
          tytul="Dziennik zdarzeń"
          filtry={filtry}
          kolumny={kolumnyDziennika}
          wiersze={wierszeDziennika}
          szukajka={{ id: "jt-szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
          pobranie={{ etykieta: "Pobierz CSV", href: "/admin/audit/export.csv" }}
        />
      </div>

      <div data-style-id="o9-journaltable-blad">
        <JournalTable
          tytul="Dziennik zdarzeń (błąd wczytania)"
          filtry={[]}
          kolumny={kolumnyDziennika}
          wiersze={[]}
          szukajka={{ id: "jt-b-szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
          komunikatPusty="Nie udało się wczytać dziennika. Odśwież stronę i spróbuj ponownie."
        />
      </div>

      <div data-style-id="o9-journaltable-ladowanie">
        <JournalTable
          tytul="Dziennik zdarzeń (wczytywanie)"
          filtry={[]}
          kolumny={kolumnyDziennika}
          wiersze={[]}
          szukajka={{ id: "jt-l-szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
          komunikatPusty="Wczytywanie dziennika…"
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<PoligonFormularze />);
