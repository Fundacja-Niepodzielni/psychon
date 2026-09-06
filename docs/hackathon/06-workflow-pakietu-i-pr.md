# Workflow pakietu HXX: branch, OpenSpec, commit i Pull Request

Ten dokument jest obowiązkową checklistą dla każdej osoby i każdego agenta
pracującego nad pakietem H01–H21. Zastąp `HXX`, `nazwa` i `<nazwa-zmiany>`
wartościami właściwymi dla swojego pakietu.

## 1. Bezpieczeństwo repozytoriów

Właściwe repozytorium pracy:

- `origin`: `https://github.com/tomekwilczak/psychon-hackaton.git`
- `upstream`: `https://github.com/Fundacja-Niepodzielni/psychon.git`

Repozytorium Fundacji jest wyłącznie źródłem odniesienia. **Nigdy nie pushuj do
`upstream`**. Wszystkie branche i Pull Requesty zespołu trafiają wyłącznie do
repozytorium Tomka przez `origin`.

Na początku pracy sprawdź:

```bash
git remote -v
git status
git branch --show-current
```

Oczekiwane remote'y:

```text
origin   https://github.com/tomekwilczak/psychon-hackaton.git
upstream https://github.com/Fundacja-Niepodzielni/psychon.git
```

Jeżeli adres `origin` jest inny, zatrzymaj się i popraw konfigurację przed
jakimkolwiek pushem lub utworzeniem PR-a.

## 2. Rezerwacja pakietu i przygotowanie brancha

Najpierw sprawdź właściciela oraz status pakietu w
`openspec/changes/koordynacja-pakietow-h01-h21/tasks.md`. Rozpoczęcie pracy wymaga
przypisania właściciela i statusu `W TOKU` widocznego na `origin/main`, zgodnie z
zasadami w `AGENTS.md`.

Pracuj wyłącznie na branchu:

```text
pakiet/HXX-nazwa
```

Nie pracuj bezpośrednio na `main`.

Nowy branch w zwykłym klonie:

```bash
git fetch origin
git switch main
git pull --rebase origin main
git switch -c pakiet/HXX-nazwa
```

Jeżeli branch już istnieje także na `origin`:

```bash
git fetch origin
git switch pakiet/HXX-nazwa
git pull --rebase origin pakiet/HXX-nazwa
```

Jeżeli używasz osobnego worktree i `main` jest już otwarty w innym katalogu,
utwórz worktree bez przełączania lokalnego `main`:

```bash
git fetch origin
git worktree add ../aplikacja-hXX-nazwa \
  -b pakiet/HXX-nazwa origin/main
```

## 3. Kontrola przed zamknięciem pakietu

Przed finalnym commitem:

1. Pobierz aktualny `origin/main` i zintegruj go ze swoim branchem.
2. Uruchom testy backendu właściwe dla pakietu oraz pełny zestaw, jeżeli zmiana
   dotyka współdzielonego zachowania.
3. Uruchom Pint, lint i build frontendu w zakresie wymaganym przez zmiany.
4. Uzupełnij `DEMO/HXX.md`.
5. Sprawdź `git diff --check`.
6. Sprawdź `git status --short` i `git diff --stat`, aby potwierdzić brak zmian
   spoza zakresu pakietu.

Przykładowa synchronizacja przed testami:

```bash
git fetch origin
git rebase origin/main
```

Nie rozwiązuj konfliktów przez nadpisywanie cudzych zmian. Jeżeli konflikt dotyczy
cudzego pakietu lub pliku współdzielonego, zgłoś go koordynatorowi.

## 4. Zamknięcie zmiany OpenSpec

Archiwizuj zmianę dopiero wtedy, gdy implementacja i zadania w `tasks.md` są
rzeczywiście ukończone. Najpierw wykonaj ścisłą walidację:

```bash
openspec validate <nazwa-zmiany> --strict
```

Następnie w Codexie uruchom:

```text
$openspec-archive-change <nazwa-zmiany>
```

Archiwizacja ma:

- zsynchronizować delta-specy z głównymi specyfikacjami,
- przenieść ukończoną zmianę do archiwum,
- pozostawić wszystkie pliki archiwizacji w bieżącym branchu.

Nie przenoś katalogów OpenSpec ręcznie. Po archiwizacji sprawdź diff i dodaj jej
pliki do tego samego commita co implementację. Pakiet ze statusem `BLOCKED` nie
jest archiwizowany jako ukończony.

## 5. Commit i push

Dodawaj konkretne pliki, nie cały katalog roboczy bez sprawdzenia:

```bash
git add <konkretne-pliki>
git commit -m "feat(HXX): opis zmiany"
git push -u origin pakiet/HXX-nazwa
```

Pushuj wyłącznie branch pakietu do `origin`.

## 6. Pull Request

Twórz PR wyłącznie w repozytorium Tomka. Zawsze podawaj `--repo`, aby nie
skierować PR-a do repozytorium Fundacji:

```bash
gh pr create \
  --repo tomekwilczak/psychon-hackaton \
  --base main \
  --head pakiet/HXX-nazwa \
  --title "HXX: opis zmiany" \
  --body "Opis zakresu, instrukcja demo i wyniki testów"
```

Po utworzeniu sprawdź PR:

```bash
gh pr view <numer> \
  --repo tomekwilczak/psychon-hackaton
```

PR musi wskazywać:

- repozytorium: `tomekwilczak/psychon-hackaton`,
- base: `main`,
- head: `pakiet/HXX-nazwa`.

W opisie PR-a podaj co najmniej zakres pakietu, wyniki testów, sposób demonstracji
oraz znane ograniczenia. Po otwarciu PR-a zgłoś koordynatorowi zmianę statusu
pakietu na `REVIEW`. Autor nie scala własnego PR-a do `main`.

## 7. Czynności zabronione

Nie wykonuj:

- `git push upstream`,
- `git push origin main`,
- `gh pr create` bez jawnego `--repo tomekwilczak/psychon-hackaton`,
- pracy bezpośrednio na `main`,
- samodzielnego merge do `main`,
- force push bez wyraźnej zgody,
- zmian w cudzych pakietach,
- ręcznego oznaczania pakietu jako `DONE` przed merge i weryfikacją.
