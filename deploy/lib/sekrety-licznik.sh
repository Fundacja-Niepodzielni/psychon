#!/usr/bin/env bash
# Wspolna logika kroku "3e - sekrety w tresci commitu" (F-106), zrodlowana
# ZAROWNO przez deploy/bramka-hosta.sh, JAK I przez
# deploy/tests/test-bramka-sekrety.sh - jedno miejsce, jedna prawda o tym,
# jak liczymy trafienia gitleaksa i jak wolamy sam skaner. Ten plik NIE ma
# efektow ubocznych przy `source` (definiuje wylacznie funkcje) i sam w sobie
# niczego nie uruchamia ani nie drukuje.
#
# Powod istnienia (nie kosmetyczny): przed wydzieleniem test mial WLASNA
# KOPIE tej logiki, wiec zielenil sie nawet wtedy, gdy prawdziwy krok 3e byl
# zepsuty albo pusty - kontrola, ktora tylko WYGLADA na kontrole.

# sekrety_uruchom_gitleaks KATALOG_TRESCI PLIK_TOML PLIK_LOG
#
# Uruchamia gitleaksa w Dockerze na KATALOGU_TRESCI (montowanym :ro), z
# regulami z PLIK_TOML (montowanym :ro pod /konfiguracja.toml), i zapisuje
# CALE wyjscie (stdout+stderr) do PLIK_LOG. Flagi ponizej NIE sa dowolne:
#   --redact  - surowy log NIE moze niesc tresci sekretu (patrz test
#               end-to-end w test-bramka-sekrety.sh, ktory to sprawdza na
#               SUROWYM logu, przed jakimkolwiek filtrem pol);
#   -v        - bez tego gitleaks `dir` NIE drukuje naglowkow
#               RuleID/File/Line WCALE (F-106) - sekrety_policz_trafienia
#               nizej bez tych naglowkow nie ma czym potwierdzic podsumowania.
# Siec wylaczona (--network none) i obraz przypiety wersja, nie `latest`.
# Zwraca kod wyjscia dockera/gitleaksa (0 = bez trafien, >0 zwykle = trafienia
# albo blad uruchomienia).
sekrety_uruchom_gitleaks() {
  local katalog_tresci="$1" plik_toml="$2" plik_log="$3"
  docker run --rm --network none \
    -v "${katalog_tresci}:/tresc:ro" \
    -v "${plik_toml}:/konfiguracja.toml:ro" \
    ghcr.io/gitleaks/gitleaks:v8.30.1 dir /tresc -c /konfiguracja.toml --no-banner --redact -v \
    >"$plik_log" 2>&1
}

# sekrety_eksportuj_tresc REV KATALOG_DOCELOWY
#
# Eksportuje tresc sledzona przez git (`git archive`) na commicie REV do
# KATALOG_DOCELOWY (ktory ma juz istniec, pusty). Wypisuje na stdout LICZBE
# wyeksportowanych plikow i konczy sie kodem 0 - TYLKO gdy `git archive`
# powiodl sie I eksport ma co najmniej 1 plik.
#
# W obu pozostalych przypadkach (F-107):
#   - `git archive` pada (np. poza drzewem git, uszkodzony obiekt) - u nas
#     zmierzone shimem jako EXIT=128;
#   - `git archive` konczy sie EXIT=0, ale eksport ma 0 plikow (np. `tar`
#     dostal pusty strumien) -
# funkcja NIE zwraca liczby (kaznik nie ma czym ufac), wypisuje NA STDERR
# JEDEN WSPOLNY komunikat z przyczyna ("sekrety: eksport tresci commitu
# nieprawidlowy - ...") i zwraca kod 2. Bez tego rozroznienia wolajacy
# (krok 3e) skanowalby 0 bajtow i pisal "no leaks found" - eksport, ktoremu
# nie mozna ufac, wygladalby jak czysty commit.
sekrety_eksportuj_tresc() {
  local rev="$1" katalog="$2" kod_archive kod_tar plikow
  local -a status_potoku
  git archive --format=tar "$rev" | tar -x -C "$katalog"
  # Oba czlony potoku sprawdzone WPROST z PIPESTATUS - nie tylko [0] (F-123):
  # `git archive` moze "udac sie" (EXIT=0), a `tar` mimo to obrobic okrojony
  # strumien z bledem (np. strumien przyciety w polowie) - taki eksport ma
  # skonczyc sie tu, zanim gitleaks dostanie do rak niepelna tresc. Cala
  # tablica skopiowana JEDNYM przypisaniem - odczyt pojedynczego elementu
  # (np. "${PIPESTATUS[0]}") jest sam w sobie prostym poleceniem, ktore
  # NADPISUJE PIPESTATUS swoim wlasnym (jednoelementowym) statusem, wiec
  # drugi odczyt po pierwszym widzialby juz pusta tablice.
  status_potoku=("${PIPESTATUS[@]}")
  kod_archive="${status_potoku[0]}"
  kod_tar="${status_potoku[1]}"
  if [[ "$kod_archive" -ne 0 ]]; then
    echo "sekrety: eksport tresci commitu nieprawidlowy - git archive zakonczyl sie bledem (EXIT=$kod_archive) - krok 3e nie moze zmierzyc sekretow" >&2
    return 2
  fi
  if [[ "$kod_tar" -ne 0 ]]; then
    echo "sekrety: eksport tresci commitu nieprawidlowy - tar zakonczyl sie bledem (EXIT=$kod_tar) mimo git archive EXIT=0 - krok 3e nie moze zmierzyc sekretow" >&2
    return 2
  fi
  plikow="$(find "$katalog" -type f | wc -l)"
  if [[ "$plikow" -eq 0 ]]; then
    echo "sekrety: eksport tresci commitu nieprawidlowy - eksport ma 0 plikow mimo git archive EXIT=0 - krok 3e nie moze zmierzyc sekretow" >&2
    return 2
  fi
  echo "$plikow"
  return 0
}

# sekrety_policz_trafienia PLIK_LOG
#
# Licznik NAPRAWDE uzywany do wyniku: z linii podsumowania "leaks found: N"
# ("no leaks found" == 0 - gitleaks nigdy nie pisze "leaks found: 0"). Druga
# liczba - naglowki "^RuleID:" (obecne w logu TYLKO dzieki -v powyzej) - jest
# KONTROLA, nie zrodlem: przy zgodnosci obu liczb ufamy podsumowaniu, przy
# niezgodnosci (np. gitleaks zmienil format wyjscia i cos to czyta zle) wolajacy
# ma dostac CZERWONY wynik z WLASNYM komunikatem, zamiast po cichu pokazac
# liczbe, ktorej nie da sie obronic.
#
# Wypisuje na stdout:
#   - liczbe (np. "3"), gdy podsumowanie i naglowki RuleID sie zgadzaja;
#   - "NIEZMIERZONE", gdy w logu nie ma ani "leaks found: N" ani "no leaks found";
#   - "NIEZGODNE podsumowanie=X ruleid=Y", gdy liczby sie NIE zgadzaja.
# Kod wyjscia: 0 tylko przy zgodnej liczbie, 1 w obu pozostalych przypadkach -
# wolajacy NIE ma czytac wypisanej liczby, gdy kod wyjscia != 0.
sekrety_policz_trafienia() {
  local log="$1" podsumowanie ruleid
  podsumowanie="$(grep -aoE "leaks found: [0-9]+" "$log" | tail -1 | grep -oE "[0-9]+" || true)"
  if [[ -z "$podsumowanie" ]] && grep -aq "no leaks found" "$log"; then
    podsumowanie=0
  fi
  ruleid="$(grep -acE "^RuleID:" "$log")"
  if [[ -z "$podsumowanie" ]]; then
    echo "NIEZMIERZONE"
    return 1
  fi
  if [[ "$podsumowanie" -ne "$ruleid" ]]; then
    echo "NIEZGODNE podsumowanie=$podsumowanie ruleid=$ruleid"
    return 1
  fi
  echo "$podsumowanie"
  return 0
}

# sekrety_pola_do_logu PLIK_LOG
#
# Filtr NIGDY nie przepuszcza Secret/Match/Finding (tresc trafienia) - tylko
# RuleID/File/Line, nawet gdy `-v` (w sekrety_uruchom_gitleaks) je drukuje
# razem z polami tresci.
sekrety_pola_do_logu() {
  local log="$1"
  grep -aE "^(RuleID|File|Line):" "$log"
}

# sekrety_git_ls_plikow REV
#
# Liczba plikow sledzonych przez git na REV, policzona NIEZALEZNIE od
# eksportu/skanu (`git ls-tree`, nie `git archive` + `tar` + `find`) - to jest
# wzorzec, z ktorym `sekrety_sprawdz_pokrycie` nizej porownuje to, co gitleaks
# NAPRAWDE obejrzal (F-122/F-123).
sekrety_git_ls_plikow() {
  local rev="$1"
  git ls-tree -r --name-only "$rev" | wc -l
}

# sekrety_git_ls_bajtow REV
#
# Suma rozmiarow blobow na REV wg `git ls-tree -r -l` (kolumna rozmiaru) -
# drugi wzorzec dla `sekrety_sprawdz_pokrycie`, niezalezny od tego, ile
# bajtow zglosil sam gitleaks w swoim logu.
sekrety_git_ls_bajtow() {
  local rev="$1"
  git ls-tree -r -l "$rev" | awk '{s+=$4} END{print s+0}'
}

# sekrety_wyciagnij_bajty_skanu PLIK_LOG
#
# Wyciaga liczbe z linii "scanned ~N bytes" loga gitleaksa (ta sama linia,
# ktora bramka i tak juz drukuje jako informacje) - tu jako CZYSTA liczbe do
# porownania. Brak takiej linii (log zepsuty/obciety) = "NIEZMIERZONE" na
# stdout i kod wyjscia 1 - wolajacy NIE ma czytac wypisanej wartosci jako
# liczby, gdy kod wyjscia != 0.
sekrety_wyciagnij_bajty_skanu() {
  local log="$1" bajty
  bajty="$(grep -aoE "scanned ~[0-9]+ bytes" "$log" | tail -1 | grep -oE "[0-9]+")"
  if [[ -z "$bajty" ]]; then
    echo "NIEZMIERZONE"
    return 1
  fi
  echo "$bajty"
  return 0
}

# sekrety_sprawdz_pokrycie PLIKOW_ZMIERZONE BAJTOW_ZMIERZONE PLIKOW_OCZEKIWANE BAJTOW_OCZEKIWANE
#
# Porownuje to, co gitleaks NAPRAWDE obejrzal (PLIKOW_ZMIERZONE z eksportu,
# BAJTOW_ZMIERZONE z jego loga "scanned ~N bytes"), z liczba policzona
# NIEZALEZNIE OD TEGO SAMEGO STRUMIENIA - PLIKOW_OCZEKIWANE i BAJTOW_OCZEKIWANE
# maja pochodzic z `sekrety_git_ls_plikow`/`sekrety_git_ls_bajtow` (git
# ls-tree), nie z eksportu ani z loga gitleaksa. Kontrola "N > 0" NIE
# wystarcza (F-123: strumien przyciety do 0,8% tresci tez daje N > 0) -
# dlatego plikow ma sie zgadzac DOKLADNIE, a bajtow ma wyjsc co najmniej
# 0,9 * oczekiwanych (gitleaks podaje "~", zapas jest swiadomy, nie na oko).
#
# Brak KTOREJKOLWIEK liczby na wejsciu (pusty string albo nie-cyfry - tak
# wyglada np. "NIEZMIERZONE" z sekrety_wyciagnij_bajty_skanu) = przyrzad nie
# dziala = czerwone, NIGDY "pewnie dobrze".
#
# Wypisuje na stdout jedna linie z obiema parami liczb (i, przy progu bajtow,
# zmierzonym zapasem w procentach), kod wyjscia: 0 = pokrycie zgodne, 1 = w
# kazdym innym przypadku.
sekrety_sprawdz_pokrycie() {
  local plikow_zm="$1" bajtow_zm="$2" plikow_ocz="$3" bajtow_ocz="$4" prog zapas

  if [[ ! "$plikow_zm" =~ ^[0-9]+$ || ! "$bajtow_zm" =~ ^[0-9]+$ ]]; then
    echo "sekrety: pokrycie eksportu NIEZMIERZONE - brak odczytu liczby plikow lub bajtow ze skanu (plikow='$plikow_zm' bajtow='$bajtow_zm')"
    return 1
  fi
  if [[ ! "$plikow_ocz" =~ ^[0-9]+$ || ! "$bajtow_ocz" =~ ^[0-9]+$ ]]; then
    echo "sekrety: pokrycie eksportu NIEZMIERZONE - brak odczytu niezaleznie policzonej liczby plikow lub bajtow (git ls-tree)"
    return 1
  fi

  if [[ "$plikow_zm" -ne "$plikow_ocz" ]]; then
    echo "sekrety: pokrycie eksportu NIEZGODNE - plikow zmierzone=$plikow_zm, oczekiwane (git ls-tree)=$plikow_ocz"
    return 1
  fi

  prog=$(( bajtow_ocz * 9 / 10 ))
  if [[ "$bajtow_ocz" -gt 0 ]]; then
    zapas=$(( bajtow_zm * 100 / bajtow_ocz ))
  else
    zapas=100
  fi
  if [[ "$bajtow_zm" -lt "$prog" ]]; then
    echo "sekrety: pokrycie eksportu NIEZGODNE - bajtow zmierzone=$bajtow_zm ponizej progu 0,9x oczekiwanych ($prog z $bajtow_ocz), zapas=${zapas}%"
    return 1
  fi

  echo "sekrety: pokrycie eksportu ZGODNE - plikow $plikow_zm/$plikow_ocz, bajtow $bajtow_zm/$bajtow_ocz (zapas ${zapas}%)"
  return 0
}
