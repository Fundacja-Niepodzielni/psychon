# Protokół odtworzenia próbnego kopii zapasowej — PsychON

Dokument do wypełnienia **odręcznie, długopisem**, w obecności Zamawiającego, w
trakcie faktycznej próby odtworzenia kopii zapasowej. Kroki i pliki, na które się
powołuje, odpowiadają temu, co naprawdę zapisuje na hoście skrypt kopii nocnej
`deploy/prod/kopia-nocna.sh` (plik kopii bazy `*.dump`, plik liczb kontrolnych
`*.liczby`, archiwum plików `*.tar.gz`), a sam sposób odtworzenia — odizolowany,
tymczasowy kontener bez dostępu do sieci — jest tym samym wzorcem, którego używa
istniejący w repozytorium skrypt `deploy/prod/odtworzenie-probne.sh`. Ten protokół
**nie jest kodem** i nie zastępuje żadnego z tych dwóch skryptów — jest zapisem
z jednej, konkretnej próby, podpisanym przez obie strony.

## 0. Dane próby

| Pole | Wartość |
|---|---|
| Data próby | ______________________ |
| Miejsce | ______________________ |
| Godzina rozpoczęcia | ______________________ |
| Godzina zakończenia | ______________________ |
| Obecni ze strony przekazującej | ______________________ |
| Obecni ze strony Zamawiającego | ______________________ |
| Plik kopii bazy użyty w próbie (nazwa, bez treści) | ______________________ |
| Plik liczb użyty w próbie (nazwa, bez treści) | ______________________ |

## 1. Kroki

Jedno polecenie lub jedna czynność na krok. Przy każdym kroku zaznaczyć
**wykonano** / **nie wykonano**, a przy „nie wykonano" przejść do §5.

| # | Krok | Wykonano | Nie wykonano |
|---|---|---|---|
| 1 | Zapisano godzinę rozpoczęcia próby (pole w §0). | ☐ | ☐ |
| 2 | Zmierzono i zapisano rozmiar pliku kopii bazy (`*.dump`). | ☐ | ☐ |
| 3 | Zmierzono i zapisano rozmiar pliku archiwum plików (`*.tar.gz`), jeśli próba obejmuje też pliki. | ☐ | ☐ |
| 4 | Policzono liczbę tabel zapisanych w pliku kopii bazy (odczyt spisu treści archiwum kopii, bez odtwarzania) — zapisano jako „liczba tabel PRZED". | ☐ | ☐ |
| 5 | Podniesiono tymczasową, odizolowaną bazę danych (kontener bez dostępu do sieci, oddzielną od bazy produkcyjnej i od bazy próbnej z poprzednich prób). | ☐ | ☐ |
| 6 | Odtworzono plik kopii bazy do tej tymczasowej bazy. | ☐ | ☐ |
| 7 | Policzono liczbę tabel w odtworzonej, tymczasowej bazie — zapisano jako „liczba tabel PO". | ☐ | ☐ |
| 8 | Dla każdej tabeli kontrolnej wymienionej w pliku liczb (`*.liczby`) policzono liczbę wierszy w odtworzonej bazie i zapisano obok liczby z pliku (§2, tabela wierszy). | ☐ | ☐ |
| 9 | Usunięto tymczasową bazę/kontener (sprzątanie po próbie). | ☐ | ☐ |
| 10 | Zapisano godzinę zakończenia próby (pole w §0) i wyliczono czas trwania w minutach. | ☐ | ☐ |
| 11 | Porównano wszystkie zmierzone liczby (kroki 4, 7, 8) z kryterium zaliczenia (§3) i zapisano wynik sprawdzenia spójności (§2). | ☐ | ☐ |

## 2. Pomiary

Każdy pomiar ma puste pole na liczbę i pole „czym zmierzono" — obie kolumny
wypełnia się w trakcie próby, nie po pamięci.

| Pomiar | Wynik | Czym zmierzono |
|---|---|---|
| Rozmiar pliku kopii bazy | __________ MB | ______________________ |
| Rozmiar pliku archiwum plików | __________ MB | ______________________ |
| Liczba tabel PRZED odtworzeniem | __________ | ______________________ |
| Liczba tabel PO odtworzeniu | __________ | ______________________ |
| Czas odtworzenia | __________ minut | ______________________ |
| Wynik sprawdzenia spójności | ☐ ZGODNE&nbsp;&nbsp;☐ NIEZGODNE | ______________________ |

### Liczba wierszy w tabelach kontrolnych (z pliku `*.liczby`)

| Nazwa tabeli | Liczba wierszy w pliku kopii | Liczba wierszy po odtworzeniu | Zgodne (T/N) |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |

(dopisać kolejne wiersze, jeśli plik liczb zawiera więcej tabel kontrolnych)

## 3. Kryterium zaliczenia

Zapisane i uzgodnione **przed** rozpoczęciem próby (§0), jako liczby — nie jako
„wszystko działa":

1. Liczba tabel PO odtworzeniu = liczba tabel PRZED odtworzeniem (§2).
2. Dla każdej tabeli kontrolnej z pliku liczb: liczba wierszy po odtworzeniu =
   liczba wierszy zapisana w pliku kopii (różnica = 0, §2 tabela wierszy).
3. Czas odtworzenia ≤ __________ minut (wartość graniczna wpisana przed próbą).
4. Próba jest **zaliczona** tylko wtedy, gdy warunki 1–3 są spełnione
   jednocześnie. Jakakolwiek niezgodność w którymkolwiek z nich oznacza próbę
   **niezaliczoną** — niezależnie od wyniku pozostałych.

Wynik końcowy: ☐ PRÓBA ZALICZONA ☐ PRÓBA NIEZALICZONA

## 4. Podpisy

| | Strona przekazująca | Zamawiający |
|---|---|---|
| Imię i nazwisko | | |
| Data | | |
| Godzina | | |
| Miejsce | | |
| Podpis | | |

## 5. Co robimy, gdy się nie uda

Wypełnić, jeśli którykolwiek krok z §1 zaznaczono „nie wykonano" lub kryterium
z §3 nie zostało spełnione.

- **Co zapisać**: numer kroku (§1), na którym coś poszło nie tak lub numer
  warunku z §3, który się nie zgodził; dokładna treść komunikatu błędu lub
  niezgodności (przepisana, nie streszczona); godzina wystąpienia.
- **Kogo powiadomić**: osobę odpowiedzialną za infrastrukturę po stronie
  Zamawiającego oraz stronę przekazującą (jeśli trwa jeszcze okres gwarancyjny/wsparcia),
  z wykorzystaniem skrzynki zespołu ustalonej w
  `deploy/INSTRUKCJA-KOMPLET-DOSTEPOW.md` (pozycja „skrzynka pocztowa
  odbierająca alerty i powiadomienia").
- **Czego NIE kasować**: pliku kopii bazy i pliku liczb użytych w tej próbie
  (dowód stanu w chwili testu), tego podpisanego protokołu, oraz — najważniejsze
  — **żadnych kopii zapasowych z rotacji na hoście produkcyjnym**, nawet
  starszych niż bieżący okres retencji, dopóki przyczyna niezgodności nie
  zostanie wyjaśniona i opisana pisemnie.

Notatki dodatkowe:

```




```
