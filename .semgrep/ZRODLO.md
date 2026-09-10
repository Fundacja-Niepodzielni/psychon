# Migawka reguł skanera statycznego (Semgrep) — skąd jest i dlaczego leży w repozytorium

## Czemu migawka, a nie rejestr

Wołanie `--config p/php` pobiera regułę z serwera semgrep.dev przy każdym biegu. Bramka, której
wynik zależy od cudzego serwera i od tego, co ktoś wczoraj zmienił w treści reguły, nie jest
przyrządem — jest prognozą. Ten sam powód, dla którego przypinamy obrazy i akcje po sumie SHA.
Reguły leżą więc w `.semgrep/reguly/` i skan idzie `--config .semgrep/reguly` **bez sieci**
(`--network none`), przez co bieg jest powtarzalny i nie zależy od dostępności rejestru.

## Ta migawka się starzeje

Zestaw poniżej został pobrany **2026-09-10** i od tego dnia nie dowiaduje się o nowych regułach
ani o poprawkach w istniejących. Im dalej od tej daty, tym więcej skaner przeoczy.

## Odświeżenie jest osobną rundą, nie „kiedyś"

Podmiana migawki zmienia liczbę trafień, więc jest zmianą przyrządu i wymaga własnego biegu
zielony → czerwony → zielony oraz przeglądu różnicy trafień. Nie robi się tego przy okazji
innej zmiany i nie robi się tego automatem.

## Czego NIE dopisywać do konfiguracji

Zmierzone 2026-09-10, niezależnie:

- **`p/laravel` NIE ISTNIEJE** — serwer zwraca HTTP 404. Jeśli ktoś kiedyś zobaczy tę nazwę
  w cudzym poradniku i „naprawi" nią konfigurację, wprowadzi zestaw, którego nie ma.
- **`p/nextjs` JEST PUSTY** — treść to dosłownie `rules: []` (10 znaków). Dodanie go nie zwiększa
  pokrycia o nic; daje tylko złudzenie, że front jest skanowany.

Zestawem zastępczym dla Laravela jest **`r/php.laravel`** i to on leży w tej migawce.

## Pliki

| plik | źródło | pobrano | bajtów | reguł | sha256 |
|---|---|---|---|---|---|
| `reguly/p-php.yaml` | https://semgrep.dev/c/p/php | 2026-09-10 | 64945 | 24 | `ccfc3341c7ac7a66b85f249713a277f4d4a0e9de93c75c609e2f82e52f0aabac` |
| `reguly/r-php-laravel.yaml` | https://semgrep.dev/c/r/php.laravel | 2026-09-10 | 26067 | 11 | `842a64b0c614663fb93ad186a9cea9f302efd4a9ac172f897be4eb5673e9a912` |

Razem **35 reguł** w dwóch plikach; skaner uruchamia z nich **31** — resztę odrzuca, bo dotyczą
języków nieobecnych w tym repozytorium. Liczba **„31 reguł na 439 plikach"** jest tą, którą należy
porównywać między biegami; sam kod wyjścia nie mówi, czy skaner cokolwiek obejrzał.

## Wołanie

    docker run --rm --network none -v "$PWD:/src" -v "$PWD/.semgrep/reguly:/reguly:ro" \
      -w /src semgrep/semgrep:1.169.0 semgrep scan --config /reguly --error --metrics=off .

`.semgrepignore` wyklucza `.semgrep/reguly/` ze skanowania: pliki reguł są **wejściem** skanera,
a nie kodem projektu. Liczba „4 trafienia zamiast 2" pochodziła z migawki, która miała zestaw
generyczny; po jego wyjęciu skaner ogląda **439 plików PHP** i do plików `.yaml` nie wchodzi wcale.
Wykluczenie **zostaje** — jako zabezpieczenie na wypadek powrotu zestawu generycznego — ale ile daje
dzisiaj, **nie zmierzyłem**, i nie należy tego zgadywać w żadną stronę.

## Czego w migawce NIE MA i dlaczego (2026-09-10)

Zestaw **`p/secrets` został z migawki wyjęty**, cały plik, nie pojedynczy wiersz. Powód jest
zmierzony, nie teoretyczny: reguły rodziny `generic.secrets.*` noszą **przykłady prawdziwych
sekretów w wierszach `pattern-not:`** — czyli w miejscach, gdzie reguła mówi „to właśnie
ignoruj". GitHub **push protection** skanuje **każdy commit w pchnięciu**, nie sam czubek, i taki
literał odrzuca (`GH013`, `Slack Incoming Webhook URL`). Pchnięcie gałęzi zostało z tego powodu
zatrzymane, a `git rm` w nowym commicie by go **nie odblokował** — literał musiał zniknąć z historii.

Pokrycia to nie zabiera — ale **nie zabierało go dopiero po dołożeniu kroku**, i to trzeba tu
zapisać uczciwie: w chwili wyjęcia zestawu bramka **nie miała żadnego skanera sekretów**
(`grep gitleaks` po `deploy/` i `.github/workflows/` dawał **0**), więc jedynym przyrządem
zostawała push protection GitHuba — czyli wiedza po fakcie, przy pchnięciu. Dziś skanuje
**krok `3e` bramki** (gitleaks `v8.30.1`, bez sieci, na treści `git archive` czubka — nie na
katalogu roboczym) **oraz** push protection: dwa niezależne przyrządy zamiast jednego. Zmienia się natomiast, ile plików
ogląda semgrep: **866 → 439**, bo reguły generyczne były jedynym powodem, dla którego wchodził
na pliki inne niż PHP. Liczba trafień jest **ta sama: 2** (te same dwa `laravel-cookie-*`), co
potwierdza, że żadne z nich nie pochodziło z wyjętego zestawu.

**Reguła na przyszłość:** semgrep służy do wzorców kodu. Zestawy z rodziny `generic.secrets.*`
do migawki nie wracają.
