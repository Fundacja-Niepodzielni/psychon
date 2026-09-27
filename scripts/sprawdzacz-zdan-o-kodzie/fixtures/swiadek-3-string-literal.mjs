// Swiadek: fragment wziety doslownie z historii repo (nie parafraza).
// Ten swiadek jest wazny nie ze wzgledu na tresc (ksztalt A, jak
// swiadek 2), ale ze wzgledu na MIEJSCE: zdanie zyje w stalej
// JavaScript (string-literal), nie w komentarzu `//` - to sprawdza
// falszywy negatyw wersji, ktora skanuje wylacznie bloki komentarzy.
const POWOD_ALERT_KONTENERY =
  "Alert.tsx renderuje się wyłącznie w kartach/formularzach (bg-card) albo wprost w treści strony przez ListTemplate/ErrorState (bg-page) — potwierdzone grepem `<Alert` w całym repo, sprawdzone też pod kątem sąsiedztwa z `bg-grey`/`bg-card-warm`/`hover:bg-row-hover` w tych samych plikach (żadne wystąpienie nie jest w środku takiego kontenera). Nigdy w komórce/wierszu Table.tsx, nigdy w nagłówku podglądu e-maila (bg-card-warm), nigdy w przycisku z hover:bg-grey.";

const POWOD_TEXTLINK_WASKI_ZAKRES =
  'TextLink w całym repo żyje dokładnie w 3 miejscach (grep "TextLink" poza components/ui/TextLink.tsx i testami): app/(administracja)/admin/kursy/page.tsx (komórka tabeli), app/(uczestnik)/panel/dokumenty/page.tsx (karta), components/po-programie/ProgramCompletedCard.tsx (karta) — nigdy wprost na tym tle.';
