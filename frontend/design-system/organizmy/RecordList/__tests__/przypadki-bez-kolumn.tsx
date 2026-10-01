import type { ReactElement } from "react";
import { ListRow } from "../../../molekuly/ListRow/ListRow";
import { RecordList } from "../RecordList";

/**
 * Przypadki użycia `RecordList` i `ListRow` BEZ trybu kolumn — po jednym na
 * każde miejsce, które z tego trybu nie korzysta. Właściwości odpowiadają
 * temu, co te ekrany podają organizmowi (te same pola, przykładowe wartości).
 * Serializacja każdego przypadku jest porównywana z zapisem sprzed dodania
 * trybu kolumn (`serializacja-bez-kolumn.json`).
 */

const nic = () => {};

const pusty = {
  naglowek: "Brak pozycji",
  tresc: "Pozycje pojawią się tutaj.",
  przycisk: { etykieta: "Odśwież", onClick: nic },
};

export interface PrzypadekBezKolumn {
  nazwa: string;
  element: ReactElement;
}

export const PRZYPADKI_BEZ_KOLUMN: PrzypadekBezKolumn[] = [
  {
    nazwa: "kursy prowadzącego",
    element: (
      <RecordList
        tytul="Kursy przypisane do Ciebie"
        wiersze={[
          {
            id: "1",
            tytul: "Wywiad psychologiczny",
            podpowiedz: "W ścieżce, miejsce drugie",
            akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz kurs: Wywiad psychologiczny", href: "/prowadzacy/kursy/1" },
          },
          {
            id: "2",
            tytul: "Webinar otwarty",
            podpowiedz: "Poza ścieżką",
            akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz kurs: Webinar otwarty", href: "/prowadzacy/kursy/2" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "kolejka profili",
    element: (
      <RecordList
        tytul="Wnioski o profil psychologa"
        wiersze={[
          {
            id: "5",
            tytul: "Joanna Demo",
            podpowiedz: "Złożony 20 września 2026",
            plakietka: { wariant: "warn", tekst: "czeka na decyzję" },
            akcja: { etykieta: "Otwórz wniosek", href: "/admin/profile/5" },
          },
          {
            id: "6",
            tytul: "Adam Demo",
            podpowiedz: "Złożony 21 września 2026",
            plakietka: { wariant: "error", tekst: "wycofany" },
            akcja: { etykieta: "Otwórz wniosek", href: "/admin/profile/6" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "pulpit prowadzącego: pytania bez odpowiedzi (nagłówek stopnia 2)",
    element: (
      <RecordList
        tytul="Pytania bez odpowiedzi"
        stopienNaglowka={2}
        wiersze={[
          {
            id: "pytanie-3",
            tytul: "Jak prowadzić pierwszą rozmowę?",
            podpowiedz: "Marta Demo · Wywiad psychologiczny",
            plakietka: { wariant: "pending", tekst: "czeka na odpowiedź" },
            akcja: { etykieta: "Odpowiedz", href: "/prowadzacy/pytania" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "pulpit prowadzącego: nadchodzące superwizje (nagłówek stopnia 3)",
    element: (
      <RecordList
        tytul="Nadchodzące superwizje"
        stopienNaglowka={3}
        wiersze={[
          {
            id: "termin-4",
            tytul: "12 października 2026, 17:00",
            podpowiedz: "Zajęte miejsca: 3 z 8.",
            akcja: { etykieta: "Otwórz grupę", href: "/prowadzacy/grupa" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "pulpit prowadzącego: moja grupa",
    element: (
      <RecordList
        tytul="Moja grupa"
        wiersze={[
          {
            id: "osoba-17",
            tytul: "Marta Demo",
            podpowiedz: "Kursy: 8 z 10 · staż: 41,5 godz. · superwizje: 5",
            akcja: { etykieta: "Otwórz grupę", href: "/prowadzacy/grupa" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "pulpit prowadzącego: moje kursy (wiersz bez podpowiedzi)",
    element: (
      <RecordList
        tytul="Moje kursy"
        wiersze={[
          {
            id: "kurs-2",
            tytul: "Wywiad psychologiczny",
            akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz kurs: Wywiad psychologiczny", href: "/prowadzacy/kursy/2" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "pulpit uczestnika: najbliższe terminy superwizji",
    element: (
      <RecordList
        tytul="Najbliższe terminy superwizji"
        wiersze={[
          {
            id: "8",
            tytul: "14 października 2026, 18:00",
            podpowiedz: "Wolne miejsca: 2",
            plakietka: { wariant: "ok", tekst: "zapisana" },
            akcja: { etykieta: "Otwórz", href: "/panel/superwizja" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "skrzynka pytań (akcja przyciskiem)",
    element: (
      <RecordList
        tytul="Pytania bez odpowiedzi"
        wiersze={[
          {
            id: "31",
            tytul: "Jak prowadzić pierwszą rozmowę?",
            podpowiedz: "Marta Demo · 20 września 2026",
            plakietka: { wariant: "pending", tekst: "czeka na odpowiedź" },
            akcja: { etykieta: "Odpowiedz", onKliknij: nic },
          },
          {
            id: "32",
            tytul: "Co zrobić po trudnym dyżurze?",
            podpowiedz: "Filip Demo · 18 września 2026",
            plakietka: { wariant: "ok", tekst: "odpowiedziane" },
            akcja: { etykieta: "Pokaż odpowiedź", onKliknij: nic },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "terminy superwizji (suma w stopce, jednostka napisem)",
    element: (
      <RecordList
        tytul="Terminy"
        jednostkaSumy="zapisów"
        wiersze={[
          {
            id: "4",
            tytul: "12 października 2026, 17:00",
            podpowiedz: "Prowadzi: Joanna Demo · limit 8",
            plakietka: { wariant: "neutral", tekst: "zaplanowany" },
            wartosc: 3,
            akcja: { etykieta: "Edytuj", onKliknij: nic },
          },
          {
            id: "5",
            tytul: "19 października 2026, 17:00",
            podpowiedz: "Prowadzi: Joanna Demo · limit 8",
            wartosc: 1250,
            akcja: { etykieta: "Edytuj", onKliknij: nic },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "lista zgłoszeń (nagłówek tylko dla czytnika, wiersze bez wcięcia)",
    element: (
      <RecordList
        tytul="Lista zgłoszeń"
        stopienNaglowka={2}
        naglowekTylkoDlaCzytnika
        wierszeBezWciecia
        wiersze={[
          {
            id: "12",
            tytul: "Anna Kandydacka",
            tytulPogrubiony: true,
            tytulDodatek: "wolontariusz",
            podpowiedz: "Zgłoszenie z 20 września 2026",
            podpowiedzTylkoDlaCzytnika: true,
            plakietka: { wariant: "warn", tekst: "czeka 11 dni" },
            akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz zgłoszenie: Anna Kandydacka", href: "/admin/nabor/12" },
          },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "suma w stopce z jednostką odmienianą funkcją",
    element: (
      <RecordList
        tytul="Sprawy"
        stopienNaglowka={2}
        jednostkaSumy={(liczba) => (liczba === 1 ? "sprawa" : "spraw")}
        wiersze={[
          { id: "a", tytul: "Zgłoszenia", wartosc: 1, akcja: { etykieta: "Otwórz", href: "/admin/nabor" } },
          { id: "b", tytul: "Dyżury", wartosc: 7, akcja: { etykieta: "Otwórz", href: "/admin/staz" } },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "jednostka sumy podana, ale wiersz bez wartości (bez stopki)",
    element: (
      <RecordList
        tytul="Terminy"
        jednostkaSumy="zapisów"
        wiersze={[
          { id: "a", tytul: "Termin pierwszy", wartosc: 2, akcja: { etykieta: "Edytuj", onKliknij: nic } },
          { id: "b", tytul: "Termin drugi", akcja: { etykieta: "Edytuj", onKliknij: nic } },
        ]}
        pusty={pusty}
      />
    ),
  },
  {
    nazwa: "stan pusty (nagłówek widoczny)",
    element: <RecordList tytul="Moje kursy" wiersze={[]} pusty={pusty} />,
  },
  {
    nazwa: "stan pusty (nagłówek tylko dla czytnika)",
    element: (
      <RecordList tytul="Lista zgłoszeń" stopienNaglowka={2} naglowekTylkoDlaCzytnika wierszeBezWciecia wiersze={[]} pusty={pusty} />
    ),
  },
  {
    nazwa: "wiersz listy kursów na pulpicie uczestnika (akcja z adresem)",
    element: (
      <ListRow
        wariant="ze-stanem"
        tytul="Wywiad psychologiczny"
        plakietka={{ wariant: "pending", tekst: "w toku" }}
        podpowiedz="Ukończono 2 z 5 lekcji"
        akcja={{ etykieta: "Otwórz", etykietaDostepna: "Otwórz kurs: Wywiad psychologiczny", href: "/panel/kursy/wywiad" }}
      />
    ),
  },
  {
    nazwa: "wiersz listy kursów na pulpicie uczestnika (kurs zamknięty)",
    element: (
      <ListRow
        wariant="ze-stanem"
        tytul="Interwencja kryzysowa"
        plakietka={{ wariant: "neutral", tekst: "zamknięty" }}
        podpowiedz="Ukończ najpierw etap 2"
        akcja={{ etykieta: "Zamknięty", nieaktywna: true }}
      />
    ),
  },
  {
    nazwa: "wiersz materiału w odtwarzaczu lekcji",
    element: <ListRow wariant="material" tytul="Karta pracy.pdf" akcja={{ etykieta: "Pobierz", href: "/pobierz/7" }} />,
  },
  {
    nazwa: "wiersz prosty z licznikiem i kliknięciem w tło",
    element: (
      <ListRow
        tytul="Dyżury"
        licznik={{ wartosc: 4, etykieta: "sprawy" }}
        akcja={{ etykieta: "Otwórz", href: "/admin/staz" }}
        onKliknijWiersz={nic}
      />
    ),
  },
  {
    nazwa: "wiersz otwarty bez akcji, bez wcięcia, z drugą częścią tytułu",
    element: (
      <ListRow
        tytul="Dyżur"
        tytulPogrubiony
        tytulDodatek="Marta Demo"
        podpowiedz="Czeka od 27 sierpnia 2026"
        podpowiedzTylkoDlaCzytnika
        bezWciecia
        otwarty
        plakietka={{ wariant: "warn", tekst: "czeka 35 dni" }}
      />
    ),
  },
  {
    nazwa: "wiersz z przyciskiem o wyglądzie odnośnika",
    element: (
      <ListRow
        tytul="Dyżur"
        tytulPogrubiony
        tytulDodatek="Filip Demo"
        bezWciecia
        akcja={{ etykieta: "Otwórz", etykietaDostepna: "Otwórz dyżur: Filip Demo", onKliknij: nic, wygladOdnosnika: true }}
      />
    ),
  },
  {
    nazwa: "wiersz rozwijalny z przyciskiem",
    element: <ListRow wariant="rozwijalny" tytul="Temat 1: Wprowadzenie" akcja={{ etykieta: "Rozwiń", onKliknij: nic }} />,
  },
];
