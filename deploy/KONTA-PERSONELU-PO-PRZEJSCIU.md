# Konta personelu, które zostają po przejściu test → produkcja — PsychON

Ten dokument podaje **regułę** i **kategorie** kont personelu, które zostają w bazie po
przejściu ze środowiska testowego na produkcję. Wszystkie pozostałe konta — także konta
personelu, których nie ma na liście — są kontami próbnymi i znikają razem ze swoimi
śladami (polecenie `php artisan psychon:zero-danych-probnych`, procedura:
`deploy/PROCEDURA-PRZEJSCIA-TEST-PRODUKCJA.md`).

**Ten dokument nie zawiera żadnej tożsamości** — żadnego imienia, nazwiska, adresu
e-mail, identyfikatora SSO ani numeru konta. Imienna lista osób, które zostają, żyje
wyłącznie poza repozytorium, w sejfie Fundacji (miejsce przechowywania dostępów, to samo,
do którego odsyła `deploy/INSTRUKCJA-KOMPLET-DOSTEPOW.md`). Właściciel wypełnia ją tam,
nie tutaj.

## 1. Kategorie kont

Nazwy ról pochodzą ze słownika `role` kontraktu API (§3.4 w
`docs/hackathon/02-kontrakt-api.md`) i z kolumny `users.role`.

| Rola (`users.role`) | Funkcja w programie | Liczba kont, które zostają | Kto zakłada konto | Po czym polecenie rozpozna konto do zachowania |
|---|---|---|---|---|
| `super_admin` (Super Admin) | właściciel platformy po stronie Fundacji | **co najmniej 1** — bez niego polecenie odmawia pracy; docelowo konto właściciela | właściciel (przed przejściem; patrz §5) | identyfikator konta na liście z pliku `--zachowaj` **i** rola `super_admin` w bazie |
| `project_manager` (Opiekun Projektu) | opiekunowie programu: rekrutacja, akceptacja stażu, warsztaty, certyfikaty | **N** — liczba opiekunów wskazana przez Fundację, zapisana w sejfie | Super Admin w panelu (zaproszenie) | identyfikator na liście **i** rola `project_manager` |
| `instructor` (Psycholog prowadzący) | prowadzący kursy i superwizje | według listy prowadzących programu, zapisanej w sejfie | Super Admin lub Opiekun Projektu w panelu (zaproszenie) | identyfikator na liście **i** rola `instructor` |
| `volunteer` (Wolontariusz) | uczestnik programu | **0** — żadne konto próbne uczestnika nie zostaje | nie dotyczy: uczestnicy zakładają się po starcie produkcji, przez rekrutację | nie dotyczy: identyfikator konta o tej roli na liście = odmowa pracy polecenia |
| `student` (Student) | uczestnik ścieżki studenckiej | **0** | jak wyżej | jak wyżej — odmowa pracy |

Kryterium nigdy nie jest adres e-mail. Polecenie dostaje listę **identyfikatorów kont**
(kolumna `users.id`) z pliku podanego w chwili biegu i sprawdza każdy wpis w bazie:

- konto istnieje, nie jest usunięte ani zanonimizowane;
- konto ma jedną z trzech ról personelu z tabeli wyżej;
- na liście jest co najmniej jedno konto `super_admin`.

Gdy którykolwiek warunek nie jest spełniony, polecenie odmawia pracy (kod wyjścia `2`),
wskazuje numer wpisu albo wiersza listy i niczego nie zmienia w bazie. Pusta lista albo
jej brak — również odmowa.

## 2. Plik listy (poza repozytorium)

- Jeden identyfikator liczbowy na wiersz; puste wiersze i wiersze zaczynające się od `#`
  są pomijane. Nic poza liczbami — żadnych imion ani adresów w komentarzach.
- Plik powstaje w chwili przejścia z danych w sejfie, leży poza repozytorium i poza
  katalogami aplikacji, prawa `600`. Po wpisaniu wyniku do protokołu administrator hosta
  usuwa go z hosta i z kontenera (krok 9 procedury).
- Identyfikator konta właściciel odczytuje w panelu administracji (lista osób filtrowana
  rolą), porównując osoby z tymi zapisanymi w sejfie. Identyfikatory nie trafiają do
  repozytorium ani do korespondencji.

## 3. Co zostaje przy koncie z listy, a co znika

Konto z listy zostaje razem z tym, co opisuje samą osobę personelu albo jej rolę w
programie. Ślady **aktywności** z fazy testowej znikają — także przy kontach z listy
(np. lekcje przeklikane przez prowadzącego „na próbę”).

| Zostaje przy koncie z listy | Znika także przy koncie z listy |
|---|---|
| wiersz konta (`users`) | postępy lekcji, podejścia do testów, warsztaty, wpisy stażu |
| zgody na dokumenty prawne (`consents`) | zapisy i terminy superwizji, przypisania superwizora, zmiany daty dostępu |
| preferencje powiadomień (`notification_preferences`) | certyfikaty, dokumenty, profil psychologa i jego załączniki |
| profil prowadzącego (`instructor_profiles`) | powiadomienia, skrzynka e-maili, wiadomości, pytania, zgłoszenia współpracy |
| przypisania prowadzącego do kursów (`course_assignments`) | dziennik zdarzeń i dziennik wglądu w dane wrażliwe z fazy testowej |
| zapis sesji SSO tego konta (`keycloak_sessions`) | eksporty danych, wiadomości pomocy, sesje i zadania kolejki w bazie |

Treść programu zostaje bez zmian, z jednym wyjątkiem wynikającym z kluczy obcych bazy:
wzory dokumentów i ich wersje (`document_templates`, `document_template_versions`)
pamiętają autora ostatniej zmiany (`updated_by`). Gdy autorem było konto spoza listy, baza
ustawia tę kolumnę na pustą przy usunięciu konta — treść wzoru zostaje, znika tylko
wskazanie autora.

Pełny podział tabel na „zostaje / usuwana / liczona” jest w klasie
`backend/app/Services/Cutover/ProbeDataPurge.php`; tabela bazy bez kategorii blokuje
bieg.

## 4. Konta próbne personelu

Konto personelu z fazy testowej, którego **nie ma** na liście, jest kontem próbnym: znika
tak samo jak konto uczestnika. Dotyczy to w szczególności kont zakładanych na potrzeby
pokazów i prób (każda rola personelu). Decyzję „to konto zostaje” podejmuje właściciel,
wpisując jego identyfikator na listę w sejfie — nie ma żadnej reguły automatycznej,
która zachowałaby konto z powodu jego adresu, nazwy albo daty założenia.

Konto personelu, które ma pracować na produkcji, a nie istnieje jeszcze w bazie w chwili
czyszczenia, **nie wymaga listy**: zakłada się je po starcie produkcji w panelu
administracji (zaproszenie), jak każde nowe konto. Zaczyna wtedy z czystym dziennikiem.

## 5. Przed czyszczeniem: konto właściciela musi móc się zalogować

Czyszczenie nie zmienia powiązania konta z systemem kont Fundacji: konto z listy zachowuje
swoje powiązanie. Przed krokiem 5 procedury właściciel (**ręka właściciela**) sprawdza, że
konto `super_admin` z listy jest powiązane z jego tożsamością w systemie kont Fundacji
(logowanie do panelu działa). Gdyby nie było — powiązanie wykonuje się poleceniem
`php artisan psychon:sso-powiaz` (identyfikator konta i identyfikator tożsamości z sejfu);
bez żadnego powiązanego konta `super_admin` po czyszczeniu nikt nie zalogowałby się do panelu.

## 6. Uprawnienia w systemie kont Fundacji

O dostępie do panelu decydują role w tokenie systemu kont Fundacji (Keycloak), nie
kolumna `users.role` (`backend/app/Services/Auth/TokenRoles.php`). Po przejściu
administrator tożsamości Fundacji:

- sprawdza, że osoby z listy mają w systemie kont role zgodne z tabelą w §1;
- odbiera role PsychON tożsamościom używanym w fazie testowej, których nie ma na liście.

To dzieje się poza repozytorium i poza bazą PsychON — polecenie tego nie robi i nie
mierzy (krok 7 procedury).
