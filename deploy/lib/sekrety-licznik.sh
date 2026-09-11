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
