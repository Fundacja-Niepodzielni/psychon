import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Text } from "../atomy/Text/Text";
import { Skeleton } from "../atomy/Skeleton/Skeleton";
import { Notice } from "../molekuly/Notice/Notice";
import { Field } from "../molekuly/Field/Field";
import { Pagination } from "../molekuly/Pagination/Pagination";
import { PageHeader } from "../organizmy/PageHeader/PageHeader";
import { RecordList } from "../organizmy/RecordList/RecordList";
import { DataTable } from "../organizmy/DataTable/DataTable";
import { StatRow } from "../organizmy/StatRow/StatRow";
import { TimeChart } from "../organizmy/TimeChart/TimeChart";
import { FormSection, type PoleFormSection } from "../organizmy/FormSection/FormSection";
import { ListTemplate } from "../szablony/ListTemplate/ListTemplate";
import { TableTemplate } from "../szablony/TableTemplate/TableTemplate";
import { FormTemplate } from "../szablony/FormTemplate/FormTemplate";

// Motyw sterowany parametrem ?theme=dark|light — ten sam sposob co
// design-system/poligon/main.tsx i formularze.tsx (oba nietkniete przez ta
// zmiane), zeby Playwright mogl go ustawic przed pomiarem bez localStorage.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
if (motyw === "dark" || motyw === "light") {
  document.documentElement.setAttribute("data-theme", motyw);
}

const okruszkiPrzykladowe = [
  { etykieta: "Panel", href: "#" },
  { etykieta: "Osoby", href: "#" },
  { etykieta: "Lista" },
];

function naglowek(tytul: string) {
  return (
    <PageHeader okruszki={okruszkiPrzykladowe} tytul={tytul} onPowrot={() => {}} />
  );
}

/**
 * Poligon pomiarowy trzech szablonow jednokolumnowych — `ListTemplate`,
 * `TableTemplate`, `FormTemplate` (warstwa 5, strumien A). Plik NOWY, osobny
 * od `main.tsx`, `lekcja.tsx` i `formularze.tsx` (wszystkie nietkniete).
 * Kazdy szablon w stanach pusty / z danymi / blad / ladowanie — stany niosa
 * organizmy w slotach, szablon sam ich nie rozgalezia. Strona nie jest
 * stona produktu, tylko narzedziem pomiarowym Playwright (kolejnosc obszarow
 * w DOM, jedna kolumna, szerokosc kolumny FormTemplate).
 */
function PoligonSzablonyKolumna() {
  const [filtrRoli, setFiltrRoli] = useState("wszyscy");

  const wierszeListy = [
    { id: "u1", tytul: "Marta Demo", podpowiedz: "wolontariuszka", akcja: { etykieta: "Otworz", href: "#" } },
    { id: "u2", tytul: "Piotr Nowak", podpowiedz: "student", akcja: { etykieta: "Otworz", href: "#" } },
  ];

  const kolumnyTabeli = [
    { klucz: "nazwisko", etykieta: "Nazwisko" },
    { klucz: "godziny", etykieta: "Godziny", liczbowa: true, jednostka: "h" },
  ];
  const wierszeTabeli = [
    { id: "t1", wartosci: { nazwisko: "Demo, Marta", godziny: 41.5 } },
    { id: "t2", wartosci: { nazwisko: "Nowak, Piotr", godziny: 12 } },
  ];

  const daneWykresu = [
    { etykieta: "Lip", nauka: 10, superwizja: 2 },
    { etykieta: "Sie", nauka: 14, superwizja: 3 },
  ];

  const polaFormularza: PoleFormSection[] = [
    { id: "f-imie", etykieta: "Imie", rodzaj: "tekst", wartosc: "Anna", onZmiana: () => {} },
    { id: "f-email", etykieta: "E-mail", rodzaj: "tekst", wartosc: "anna@przyklad.pl", onZmiana: () => {} },
  ];
  const polaFormularzaBledy: PoleFormSection[] = [
    { id: "f-b-imie", etykieta: "Imie", rodzaj: "tekst", wartosc: "", onZmiana: () => {}, blad: "Podaj imie" },
  ];
  const polaFormularzaPuste: PoleFormSection[] = [
    { id: "f-p-imie", etykieta: "Imie", rodzaj: "tekst", wartosc: "", onZmiana: () => {} },
  ];
  const polaFormularzaLadowanie: PoleFormSection[] = [
    { id: "f-l-imie", etykieta: "Imie", rodzaj: "tekst", wartosc: "Anna", onZmiana: () => {}, zablokowany: true },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 40 }}>
      <p>
        Poligon pomiarowy — szablony ListTemplate, TableTemplate, FormTemplate —
        nie jest stroną produktu, tylko narzędziem pomiarowym.
      </p>

      {/* ListTemplate — z danymi */}
      <div data-style-id="list-template-z-danymi">
        <ListTemplate
          naglowek={naglowek("Osoby w programie")}
          filtry={
            <Field
              id="lt-rola"
              etykieta="Rola"
              rodzaj="wybor"
              wartosc={filtrRoli}
              onZmiana={setFiltrRoli}
              opcje={[
                { wartosc: "wszyscy", etykieta: "Wszyscy" },
                { wartosc: "wolontariusz", etykieta: "Wolontariusz" },
              ]}
            />
          }
          lista={
            <RecordList
              tytul="Osoby"
              wiersze={wierszeListy}
              pusty={{ naglowek: "Brak osob", tresc: "Lista jest pusta.", przycisk: { etykieta: "Odswiez", onClick: () => {} } }}
            />
          }
          stronicowanie={<Pagination strona={1} stron={3} naPoprzednia={() => {}} naNastepna={() => {}} />}
        />
      </div>

      {/* ListTemplate — pusty (RecordList sam pokazuje EmptyState dla wiersze=[]) */}
      <div data-style-id="list-template-pusty">
        <ListTemplate
          naglowek={naglowek("Osoby w programie")}
          lista={
            <RecordList
              tytul="Osoby"
              wiersze={[]}
              pusty={{ naglowek: "Brak osob", tresc: "Nikt jeszcze nie dolaczyl.", przycisk: { etykieta: "Zapros", onClick: () => {} } }}
            />
          }
        />
      </div>

      {/* ListTemplate — blad (obszar listy niesie Notice error zamiast RecordList) */}
      <div data-style-id="list-template-blad">
        <ListTemplate
          naglowek={naglowek("Osoby w programie")}
          lista={
            <Notice wariant="error" tytul="Nie udalo sie wczytac listy">
              Odswiez strone i sprobuj ponownie.
            </Notice>
          }
        />
      </div>

      {/* ListTemplate — ladowanie (szkielet w ksztalcie wierszy) */}
      <div data-style-id="list-template-ladowanie">
        <ListTemplate naglowek={naglowek("Osoby w programie")} lista={<Skeleton wiersze={4} />} />
      </div>

      {/* TableTemplate — z danymi */}
      <div data-style-id="table-template-z-danymi">
        <TableTemplate
          naglowek={naglowek("Rzetelnosc nauki")}
          statystyki={
            <StatRow
              kafle={[
                { id: "s1", etykieta: "Godziny", wartosc: 41, mianownik: "h", dominujacy: true },
                { id: "s2", etykieta: "Superwizje", wartosc: 5, mianownik: "obecnosci" },
              ]}
            />
          }
          zdanie={<Text>Liczby licza sie z ukonczonych lekcji z dodatnim czasem trwania.</Text>}
          zakres={<Text wariant="pusty">Od 1 lipca do 31 sierpnia 2026.</Text>}
          wykres={<TimeChart tytul="Godziny w czasie" dane={daneWykresu} jednostka="h" zakres="lipiec-sierpien" />}
          tabela={<DataTable tytul="Szczegoly" kolumny={kolumnyTabeli} wiersze={wierszeTabeli} />}
          wsparcie={<Text wariant="pusty">Dane odswiezane raz dziennie.</Text>}
        />
      </div>

      {/* TableTemplate — pusty (DataTable sam pokazuje komunikat dla wiersze=[]) */}
      <div data-style-id="table-template-pusty">
        <TableTemplate
          naglowek={naglowek("Rzetelnosc nauki")}
          tabela={<DataTable tytul="Szczegoly" kolumny={kolumnyTabeli} wiersze={[]} />}
        />
      </div>

      {/* TableTemplate — blad (wykres w stanie blad, tabela z komunikatem) */}
      <div data-style-id="table-template-blad">
        <TableTemplate
          naglowek={naglowek("Rzetelnosc nauki")}
          wykres={
            <TimeChart
              tytul="Godziny w czasie"
              dane={[]}
              jednostka="h"
              zakres="lipiec-sierpien"
              stan={{ rodzaj: "blad", tresc: "Nie udalo sie wczytac wykresu.", onPonow: () => {} }}
            />
          }
          tabela={
            <DataTable
              tytul="Szczegoly"
              kolumny={kolumnyTabeli}
              wiersze={[]}
              komunikatPusty="Nie udalo sie wczytac danych. Odswiez strone."
            />
          }
        />
      </div>

      {/* TableTemplate — ladowanie */}
      <div data-style-id="table-template-ladowanie">
        <TableTemplate
          naglowek={naglowek("Rzetelnosc nauki")}
          wykres={<TimeChart tytul="Godziny w czasie" dane={[]} jednostka="h" zakres="lipiec-sierpien" stan={{ rodzaj: "ladowanie" }} />}
          tabela={<DataTable tytul="Szczegoly" kolumny={kolumnyTabeli} wiersze={[]} komunikatPusty="Wczytywanie danych…" />}
        />
      </div>

      {/* FormTemplate — wariant panel, z danymi */}
      <div data-style-id="form-template-panel-z-danymi">
        <FormTemplate
          naglowek={naglowek("Dane kontaktowe")}
          tresc={<FormSection tytul="Dane kontaktowe" pola={polaFormularza} onAnuluj={() => {}} onZapisz={() => {}} />}
        />
      </div>

      {/* FormTemplate — wariant panel, pusty (pola bez wypelnionych wartosci) */}
      <div data-style-id="form-template-panel-pusty">
        <FormTemplate
          naglowek={naglowek("Dane kontaktowe")}
          tresc={<FormSection tytul="Dane kontaktowe" pola={polaFormularzaPuste} onAnuluj={() => {}} onZapisz={() => {}} />}
        />
      </div>

      {/* FormTemplate — wariant panel, blad (podsumowanie + blad przy polu) */}
      <div data-style-id="form-template-panel-blad">
        <FormTemplate
          naglowek={naglowek("Dane kontaktowe")}
          powiadomienie={<Notice wariant="error" tytul="Popraw zaznaczone pola">Sprawdz pole ponizej.</Notice>}
          tresc={<FormSection tytul="Dane kontaktowe" pola={polaFormularzaBledy} onAnuluj={() => {}} onZapisz={() => {}} />}
        />
      </div>

      {/* FormTemplate — wariant panel, ladowanie (pola zablokowane) */}
      <div data-style-id="form-template-panel-ladowanie">
        <FormTemplate
          naglowek={naglowek("Dane kontaktowe")}
          tresc={
            <FormSection
              tytul="Dane kontaktowe"
              pola={polaFormularzaLadowanie}
              etykietaZapisz="Zapisywanie…"
              onAnuluj={() => {}}
              onZapisz={() => {}}
            />
          }
        />
      </div>

      {/* FormTemplate — wariant publiczny (ekran wejscia, zastepuje AuthTemplate) */}
      <div data-style-id="form-template-publiczny">
        <FormTemplate
          wariant="publiczny"
          logo={<Text>Psychon</Text>}
          tresc={
            <FormSection
              tytul="Ustaw haslo"
              pola={[{ id: "f-haslo", etykieta: "Nowe haslo", rodzaj: "tekst", wartosc: "", onZmiana: () => {} }]}
              onAnuluj={() => {}}
              onZapisz={() => {}}
            />
          }
          drobnyDruk={<Text wariant="pusty">Link wygasa po 48 godzinach.</Text>}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<PoligonSzablonyKolumna />);
