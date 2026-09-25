# Instrukcja kompletu dostępów — wdrożenie PsychON

Dokument dla osoby nietechnicznej po stronie Zamawiającego (Fundacja Niepodzielni),
która ma przejąć od strony przekazującej wdrożenie wszystkie dostępy potrzebne do
samodzielnego utrzymania platformy PsychON po zakończeniu współpracy.

**Ten dokument nie zawiera żadnych wartości** — żadnego adresu, nazwy konta, klucza,
hasła ani tokenu. Wymienia tylko **nazwy pozycji dostępu** i — tam gdzie to pomaga —
**nazwy zmiennych środowiskowych** (czyli nazw pól konfiguracji, w których te
wartości mieszkają w plikach na serwerze; same wartości pozostają poza tym plikiem
i poza repozytorium kodu). Listę zbudowano na podstawie przeglądu katalogu `deploy/`,
głównych plików `docker-compose*.yml`, `.github/workflows/` oraz dokumentu
`docs/system/01-architektura-i-integracje.md` — nie z pamięci.

## Słowniczek (terminy techniczne użyte niżej)

- **Host** — serwer (komputer w internecie), na którym działa aplikacja.
- **Konto systemowe / użytkownik systemowy** — konto do logowania się na hoście
  (jak konto Windows, tylko na serwerze Linux).
- **Klucz SSH** — para plików (klucz prywatny + publiczny) służąca do logowania
  się na hosta bez hasła; bezpieczniejsza i wygodniejsza od hasła.
- **Zmienna środowiskowa** — nazwane pole konfiguracji (np. `DB_PASSWORD`), którego
  wartość aplikacja odczytuje przy starcie; wartości leżą w pliku `.env` na hoście,
  poza repozytorium kodu.
- **Token / klucz API** — ciąg znaków pełniący rolę hasła do usługi zewnętrznej
  (np. do wysyłki wideo albo poczty), używany zamiast loginu i hasła.
- **Repozytorium** — miejsce przechowywania kodu źródłowego (tu: GitHub).
- **Panel** — strona internetowa do zarządzania kontem u dostawcy usługi
  (np. panel Cloudflare, panel dostawcy poczty).
- **DNS** — system, który tłumaczy nazwę domeny (adres strony) na adres serwera.
- **TLS / certyfikat** — mechanizm szyfrowania połączenia (kłódka w przeglądarce);
  certyfikat to plik potwierdzający tożsamość serwera.
- **SSO / system kont** — wspólne logowanie dla usług Fundacji (u nas: Keycloak,
  nazywany w dokumentacji „system kont Fundacji" / „Konta Niepodzielni"); PsychON
  nie ma własnego logowania, korzysta z tego systemu.

## Wzór protokołu przekazania dostępu

Do każdej pozycji poniżej stosuje się ten sam wzór przekazania, chyba że przy danej
pozycji zaznaczono inaczej:

1. Strona przekazująca przygotowuje **protokół przekazania** w dwóch jednobrzmiących
   egzemplarzach (papierowych albo podpisanych elektronicznie), zawierający: nazwę
   pozycji dostępu (z listy niżej), datę i miejsce przekazania, sposób przekazania
   wartości (np. „na miejscu, odczytane z ekranu i wpisane bezpośrednio przez
   odbierającego", „kanałem szyfrowanym uzgodnionym osobno" — **nigdy przez zwykły
   e-mail ani czat w postaci jawnego tekstu**), oraz miejsce na podpisy obu stron.
2. **Dwie strony podpisują**: osoba przekazująca dostęp (dalej: **strona przekazująca**)
   i osoba odbierająca (przedstawiciel Zamawiającego wskazany do tej roli).
3. **Gdzie zostaje protokół**: po jednym podpisanym egzemplarzu u każdej ze stron;
   egzemplarz Zamawiającego trafia do archiwum projektu (razem z pozostałymi
   dokumentami wdrożeniowymi, poza repozytorium kodu, bo nie jest kodem).
4. **Co robi odbierający zaraz po przejęciu**:
   - sprawdza, że dostęp faktycznie działa (np. udane zalogowanie),
   - zmienia hasło / generuje własny klucz SSH / rotuje token na własny,
     tak by wartość znana stronie przekazującej przestała działać,
   - odnotowuje przejęcie w rejestrze dostępów (wzór na końcu tego dokumentu).

Poniżej — pozycje dostępu. Każda ma odpowiedź na cztery pytania: **co** to jest,
**gdzie** się to znajduje/używa, **kto** ma to otrzymać, **jak** to przekazać.

---

## 1. Konto wdrożeniowe na hoście (`deploy`)

- **Co**: konto systemowe na hoście produkcyjnym z prawem `sudo` (może wykonywać
  polecenia administracyjne) i kluczem SSH, używane do wdrożeń i prac
  administracyjnych. Zakładane skryptem `deploy/bootstrap-host.sh`.
- **Gdzie**: host produkcyjny (i odpowiednio host środowiska odbiorczego
  `psychon-dev`, jeśli to osobna maszyna).
- **Kto**: administrator infrastruktury po stronie Zamawiającego (lub Fundacji, jeśli
  hosting pozostaje u niej).
- **Jak**: wg wzoru protokołu wyżej; przekazywany jest **klucz SSH** (nie hasło —
  logowanie hasłem jest wyłączone przez `bootstrap-host.sh`). Po przejęciu
  odbierający dogrywa **swój własny** klucz publiczny do konta i usuwa klucz
  strony przekazującej z pliku `authorized_keys` na hoście.

## 2. Konto bramki/CI na hoście (`bramka`)

- **Co**: konto systemowe na hoście bez prawa `sudo`, należące wyłącznie do grupy
  `docker` — służy do uruchamiania zestawów kontrolnych (bramek jakości) na
  hoście, nie do zwykłej administracji.
- **Gdzie**: ten sam host co konto `deploy` (`deploy/bramka-hosta.sh`,
  `deploy/bramka-zdalna.sh`).
- **Kto**: osoba/system odpowiedzialny za utrzymanie procesu weryfikacji jakości
  kodu po stronie Zamawiającego (lub pozostaje nieużywane, jeśli Zamawiający
  rezygnuje z tego mechanizmu).
- **Jak**: jak wyżej — klucz SSH osobny od konta `deploy`. Odbierający decyduje,
  czy w ogóle chce utrzymywać to konto dalej; jeśli nie — protokół odnotowuje
  decyzję o wyłączeniu konta zamiast przejęcia.

## 3. Dostęp administratora do repozytorium kodu

- **Co**: uprawnienia właściciela/administratora repozytorium GitHub (zarządzanie
  dostępami innych osób, ustawieniami repo, sekretami — patrz punkt 4).
- **Gdzie**: GitHub, organizacja `Fundacja-Niepodzielni`, repozytorium `psychon`.
- **Kto**: osoba wyznaczona przez Zamawiającego jako administrator techniczny
  (docelowo z własnym kontem GitHub, nie kontem strony przekazującej).
- **Jak**: nie protokołem papierowym z wartością — to uprawnienie nadaje się przez
  **zaproszenie do organizacji GitHub na adres e-mail odbierającego**. Sam fakt
  nadania uprawnień i datę odnotowuje protokół wg wzoru wyżej (bez żadnej
  wartości do wpisania — GitHub nie przekazuje „sekretu", tylko członkostwo).
  Po przejęciu odbierający sprawdza, że konta osób powiązanych ze stroną
  przekazującą, którym nie przysługuje dalszy mandat, zostały usunięte
  z organizacji.

## 4. Sekrety repozytorium w GitHub Actions

- **Co**: wartości używane przez zautomatyzowane procesy repozytorium (CI), np.
  zmienna `SONAR_TOKEN` używana w `.github/workflows/sonarcloud.yml` i
  `.github/workflows/nocne-pokrycie.yml` do raportowania jakości kodu.
- **Gdzie**: ustawienia repozytorium GitHub → Secrets and variables → Actions.
- **Kto**: administrator repozytorium (punkt 3).
- **Jak**: GitHub nie pozwala odczytać istniejącego sekretu — jedyny bezpieczny
  sposób przekazania to: strona przekazująca (lub odbierający, jeśli zakłada nowe
  konto u dostawcy z punktu 14) generuje **nową** wartość u dostawcy i **od razu**
  wpisuje ją w ustawienia repozytorium; stara wartość jest unieważniana u
  dostawcy. Protokół odnotowuje wyłącznie fakt i datę rotacji, nie wartość.

## 5. Plik środowiskowy aplikacji na hoście

- **Co**: plik konfiguracyjny aplikacji przechowywany **poza repozytorium**, prawa
  dostępu ograniczone do właściciela (600). Wzorzec pól (bez wartości) w
  `deploy/.env.example`. Zawiera m.in. pola: `APP_KEY`, `DB_DATABASE`,
  `DB_USERNAME`, `DB_PASSWORD`, `AUTH_KEYCLOAK_ISSUER`, `AUTH_SECRET`,
  `BASIC_AUTH_USER`, `BASIC_AUTH_HASH`, `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`,
  `BUNNY_LIBRARY_ID`, `BUNNY_TOKEN_SECURITY_KEY`, `STAGING_DOMAIN` i inne pola
  portów/adresów.
- **Gdzie**: host produkcyjny i host środowiska odbiorczego, ścieżka poza
  repozytorium (skrypt `deploy/psychon-dev/deploy.sh` domyślnie oczekuje
  `/opt/psychon/.env`, ale to tylko wartość domyślna — właściwa ścieżka na
  konkretnym hoście jest częścią przekazania, nie tego dokumentu).
- **Kto**: konto wdrożeniowe `deploy` (punkt 1) i administrator infrastruktury.
- **Jak**: plik nie jest przekazywany przez protokół „na papierze" z treścią —
  jest już na hoście, do którego dostęp przejmuje się przez punkt 1. Protokół
  odnotowuje: że plik istnieje, ma prawa 600, oraz że po przejęciu wartości
  wymagające rotacji (patrz punkty 9–11 niżej — klucze do usług zewnętrznych)
  zostały wymienione na nowe, znane tylko odbierającemu.

## 6. Plik konfiguracji kopii zapasowych i monitoringu hosta

- **Co**: plik konfiguracyjny (poza repozytorium) czytany przez skrypty
  `deploy/prod/kopia-nocna.sh` i `deploy/prod/monitoring.sh`; wzorzec pól w
  `deploy/prod/kopie.env.example`. Wymagane pola nazwane wprost w skryptach:
  `PROJEKT_COMPOSE`, `DB_UZYTKOWNIK`, `DB_NAZWA`, `KATALOG_KOPII`,
  `KATALOG_STORAGE`, `RETENCJA_DNI`, `TABELE_KONTROLNE`, `CEL_ZEWNETRZNY`,
  `USLUGI_MONITOROWANE`, `SCIEZKA_DYSKU`, `PROG_DYSKU_PROC`,
  `ADRES_KONTROLI_HTTP`, `KOD_HTTP_OCZEKIWANY`, `KATALOG_STANU`,
  `HTTP_LIMIT_CZASU_S`, `HTTP_LICZBA_PROB`, `POCZTA_HOST`, `POCZTA_PORT`,
  `POCZTA_NADAWCA`, `USLUGA_WYSYLKI_POCZTY`, `ADRES_ALERTOW`.
- **Gdzie**: host produkcyjny, poza repozytorium (wołany z harmonogramu —
  patrz punkt 15).
- **Kto**: konto wdrożeniowe `deploy` i osoba odpowiedzialna za monitoring.
- **Jak**: jak w punkcie 5 — dostęp idzie przez przejęcie hosta; protokół
  odnotowuje istnienie pliku i to, że dane dostępu do poczty alertowej
  (punkt 12) zostały zrotowane po przejęciu.

## 7. Certyfikat TLS Cloudflare Origin CA

- **Co**: para plików certyfikatu (`origin.crt`, `origin.key`), którymi Caddy
  (serwer wejściowy aplikacji) szyfruje połączenie między Cloudflare a hostem
  środowiska odbiorczego (`deploy/psychon-dev/deploy.sh`, `deploy/psychon-dev/Caddyfile`).
- **Gdzie**: host środowiska odbiorczego, katalog poza repozytorium.
- **Kto**: administrator infrastruktury.
- **Jak**: certyfikat generuje się na nowo z panelu Cloudflare (punkt 8) po
  przejęciu tego panelu — nie ma sensu przekazywać starego pliku klucza
  prywatnego. Protokół odnotowuje wygenerowanie nowej pary i podmianę na
  hoście.

## 8. Panel/konto Cloudflare (DNS, Access, certyfikaty Origin CA)

- **Co**: konto u dostawcy Cloudflare zarządzające domeną (DNS), regułami
  dostępu do środowiska odbiorczego (Cloudflare Access) oraz certyfikatami
  Origin CA (punkt 7).
- **Gdzie**: panel dostawcy (poza repozytorium; nazwa konta/domeny nie jest
  wypisana w tym dokumencie).
- **Kto**: administrator infrastruktury Zamawiającego.
- **Jak**: przez zaproszenie odbierającego jako właściciela/administratora
  konta w panelu dostawcy (jeśli dostawca na to pozwala) lub przez pełną
  zmianę danych logowania na nowe, znane tylko odbierającemu, z jednoczesnym
  odebraniem dostępu stronie przekazującej. Protokół odnotowuje datę zmiany.

## 9. Konto systemu kont Fundacji (Keycloak / „Konta Niepodzielni")

- **Co**: dostęp administracyjny do realmu/konfiguracji klienta aplikacji w
  systemie logowania wspólnym dla usług Fundacji (PsychON nie ma własnego
  logowania — korzysta z tego systemu; adres systemu jest wartością pola
  `AUTH_KEYCLOAK_ISSUER`, patrz `docs/system/01-architektura-i-integracje.md`
  §4.7).
- **Gdzie**: panel administracyjny systemu kont Fundacji, poza repozytorium
  PsychON (to osobna usługa, wspólna dla wielu produktów Fundacji).
- **Kto**: administrator tożsamości Fundacji, jeśli jeszcze nim nie jest osoba
  odbierająca pozostałe dostępy.
- **Jak**: to konto może już należeć do Fundacji niezależnie od tego wdrożenia
  — protokół wtedy tylko potwierdza, że strona przekazująca nie zachowuje
  własnego dostępu administracyjnego do konfiguracji klienta
  `psychon-api`/`psychon-web`
  po zakończeniu współpracy (odebranie uprawnień, nie przekazanie wartości).

## 10. Konto usługi wideo Bunny Stream

- **Co**: konto u dostawcy hostingu wideo, z którego pochodzą pola
  `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_LIBRARY_ID`,
  `BUNNY_TOKEN_SECURITY_KEY` (decyzja architektoniczna: Bunny Stream, patrz
  `docs/system/01-architektura-i-integracje.md` §4.1).
- **Gdzie**: panel dostawcy, poza repozytorium.
- **Kto**: administrator infrastruktury / osoba zarządzająca treściami wideo.
- **Jak**: jak w punkcie 8 — przejęcie konta w panelu dostawcy albo pełna
  rotacja klucza API na nowy, znany tylko odbierającemu, z wpisaniem nowej
  wartości do pliku środowiskowego (punkt 5).

## 11. Konto dostawcy poczty transakcyjnej aplikacji

- **Co**: konto u dostawcy wysyłki e-maili z aplikacji (np. powiadomienia dla
  uczestników); dostawca jest wg dokumentacji architektury decyzją otwartą w
  chwili pisania tego dokumentu (`docs/system/01-architektura-i-integracje.md`
  §4.2) — pozycja obejmuje ten dostęp niezależnie od tego, który dostawca
  ostatecznie zostanie wybrany.
- **Gdzie**: panel dostawcy, poza repozytorium; domena nadawcza wymaga też
  wpisów DNS (patrz punkt 8).
- **Kto**: administrator infrastruktury.
- **Jak**: jak w punkcie 8.

## 12. Usługa wysyłki poczty alertowej z hosta

- **Co**: dostęp (konto/SMTP) używany wyłącznie przez `deploy/prod/monitoring.sh`
  do wysyłki powiadomień o awarii (pola `POCZTA_HOST`, `POCZTA_PORT`,
  `POCZTA_NADAWCA`, `USLUGA_WYSYLKI_POCZTY` w pliku z punktu 6) — to osobna
  sprawa od poczty transakcyjnej aplikacji (punkt 11), bo obsługuje
  wyłącznie alerty operacyjne hosta.
- **Gdzie**: host produkcyjny (plik z punktu 6) i ewentualnie panel dostawcy
  tej poczty.
- **Kto**: administrator infrastruktury.
- **Jak**: jak w punktach 5 i 6 — rotacja wartości po przejęciu hosta.

## 13. Skrzynka pocztowa odbierająca alerty i powiadomienia dostawców

- **Co**: adres e-mail, na który trafiają: alerty monitoringu hosta (pole
  `ADRES_ALERTOW`), powiadomienia od dostawców zewnętrznych (Cloudflare,
  Bunny, GitHub, dostawca poczty) o zmianach, fakturach, wygasających
  certyfikatach itd. — w praktyce skrzynka zespołu/organizacji, nie prywatna
  skrzynka jednej osoby.
- **Gdzie**: poczta Zamawiającego (poza repozytorium).
- **Kto**: zespół/osoba odpowiedzialna za utrzymanie po stronie Zamawiającego.
- **Jak**: jeśli skrzynka już istnieje po stronie Zamawiającego — protokół
  tylko potwierdza, że to ten adres jest wpisany we wszystkich panelach z
  punktów 8, 10, 11, 14 (rejestr adresu, nie przekazanie hasła). Jeśli
  skrzynkę zakładała strona przekazująca — przekazanie jak w punkcie 8,
  z natychmiastową zmianą hasła i włączeniem drugiego składnika logowania.

## 14. Miejsce kopii zapasowej poza hostem

- **Co**: docelowe miejsce, do którego `deploy/prod/kopia-nocna.sh` (krok
  opcjonalny, sterowany polem `CEL_ZEWNETRZNY` z punktu 6) kopiuje pliki
  kopii zapasowej poza host produkcyjny — zgodnie z zasadą, że kopia
  trzymana wyłącznie na tym samym hoście co dane nie chroni przed awarią
  całego hosta.
- **Gdzie**: zależnie od wyboru Zamawiającego (inny serwer, magazyn
  obiektowy/S3, dysk sieciowy) — poza repozytorium.
- **Kto**: administrator infrastruktury.
- **Jak**: jak w punkcie 8, jeśli to usługa zewnętrzna z osobnym kontem; jeśli
  to inny serwer własny Zamawiającego — jak w punkcie 1 (klucz SSH).

## 15. Harmonogram zadań (crontab) na hoście

- **Co**: wpisy harmonogramu użytkownika `deploy` uruchamiające co noc kopię
  zapasową i co 5 minut monitoring — wzorzec w
  `deploy/prod/harmonogram/psychon-crontab` (ścieżki w pliku są przykładowe,
  do dostosowania przy instalacji, nie do przepisania „na sztywno").
- **Gdzie**: host produkcyjny, harmonogram konta `deploy`.
- **Kto**: administrator infrastruktury (dziedziczy dostęp przez punkt 1 —
  to nie jest osobny sekret, tylko konfiguracja widoczna po zalogowaniu).
- **Jak**: nie wymaga osobnego protokołu z wartością — protokół z punktu 1
  (przejęcie konta `deploy`) wystarcza; warto tylko odnotować w tym samym
  protokole, że harmonogram sprawdzono poleceniem `crontab -u deploy -l`.

## 16. Panel monitoringu błędów aplikacji (front i back)

- **Co**: usługa monitoringu błędów aplikacji, wymagana architektonicznie
  (`docs/system/01-architektura-i-integracje.md` §1 pkt 10 i diagram w §2,
  węzeł „Monitoring błędów") — w chwili pisania tego dokumentu bez
  wskazanego w drzewie repozytorium dostawcy ani pliku konfiguracyjnego;
  pozycja odnotowuje wymóg przekazania dostępu, gdy dostawca zostanie
  wybrany i wdrożony.
- **Gdzie**: panel dostawcy (do ustalenia), poza repozytorium.
- **Kto**: administrator infrastruktury / zespół deweloperski Zamawiającego.
- **Jak**: jak w punkcie 8, w chwili wdrożenia tej usługi.

---

## Rejestr dostępów (do prowadzenia ręcznie przez Zamawiającego)

| # | Pozycja dostępu | Data przekazania | Kto odebrał | Dane zrotowane (tak/nie) | Podpisy |
|---|---|---|---|---|---|
| 1 | Konto wdrożeniowe `deploy` | | | | |
| 2 | Konto bramki `bramka` | | | | |
| 3 | Repozytorium kodu | | | | |
| 4 | Sekrety GitHub Actions | | | | |
| 5 | Plik środowiskowy aplikacji | | | | |
| 6 | Plik konfiguracji kopii/monitoringu | | | | |
| 7 | Certyfikat Cloudflare Origin CA | | | | |
| 8 | Panel Cloudflare | | | | |
| 9 | System kont Fundacji (Keycloak) | | | | |
| 10 | Bunny Stream | | | | |
| 11 | Poczta transakcyjna aplikacji | | | | |
| 12 | Poczta alertowa hosta | | | | |
| 13 | Skrzynka zespołu (alerty/dostawcy) | | | | |
| 14 | Miejsce kopii poza hostem | | | | |
| 15 | Harmonogram (crontab) | | | | |
| 16 | Monitoring błędów aplikacji | | | | |
