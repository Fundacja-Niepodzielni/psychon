#!/usr/bin/env bash
# Wspolna logika kroku "3e - sekrety w tresci commitu", zrodlowana
# ZAROWNO przez deploy/bramka-hosta.sh, JAK I przez
# deploy/tests/test-bramka-sekrety.sh - jedno miejsce, jedna prawda o tym,
# jak liczymy trafienia gitleaksa i jak wolamy sam skaner. Ten plik NIE ma
# efektow ubocznych przy `source` (definiuje wylacznie funkcje) i sam w sobie
# niczego nie uruchamia ani nie drukuje.
#
# Powod istnienia (nie kosmetyczny): przed wydzieleniem test mial WLASNA
# KOPIE tej logiki, wiec zielenil sie nawet wtedy, gdy prawdziwy krok 3e byl
# zepsuty albo pusty - kontrola, ktora tylko WYGLADA na kontrole.

# sekrety_uruchom_gitleaks KATALOG_TRESCI PLIK_TOML PLIK_LOG [PLIK_ODCISKOW]
#
# Uruchamia gitleaksa w Dockerze na KATALOGU_TRESCI (montowanym :ro), z
# regulami z PLIK_TOML (montowanym :ro pod /konfiguracja.toml), i zapisuje
# CALE wyjscie (stdout+stderr) do PLIK_LOG. Flagi ponizej NIE sa dowolne:
#   --redact       - surowy log NIE moze niesc tresci sekretu (patrz test
#                    end-to-end w test-bramka-sekrety.sh, ktory to sprawdza na
#                    SUROWYM logu, przed jakimkolwiek filtrem pol);
#   -v             - bez tego gitleaks `dir` NIE drukuje naglowkow
#                    RuleID/File/Line WCALE - sekrety_policz_trafienia
#                    nizej bez tych naglowkow nie ma czym potwierdzic
#                    podsumowania.
#   -l debug       - bez tego gitleaks NIE mowi, KTORE pliki pominal
#                    (linie "DBG skipping file: global allowlist path=...",
#                    "DBG skipping empty file path=..." i "DBG skipping binary
#                    file mime_type=... path=..." - TRZY klasy, zmierzone
#                    16.09.2026 na v8.30.1). Bez tych linii
#                    sekrety_pliki_pominiete nizej nie ma z czego wyliczyc
#                    zbioru pomijanego - a bez niego pokrycie eksportu albo
#                    zgaduje prog "na oko", albo trzyma liste plikow na
#                    sztywno (co za tydzien sklamie). Zmierzone: dodanie tej
#                    flagi NIE zmienia linii "leaks found"/"no leaks
#                    found"/"scanned ~N bytes"/"RuleID:" (test end-to-end
#                    powyzej to pilnuje), wiec licznik trafien nie traci nic.
# PLIK_ODCISKOW (domyslnie `.gitleaksignore` obok PLIK_TOML) montowany jest pod
# /odciski i podawany przez --gitleaks-ignore-path: tam, i TYLKO tam, mieszkaja
# wyciszenia pojedynczych trafien - po ODCISKU konkretnego znaleziska, nie po
# sciezce. Wyciszenie po sciezce w .gitleaks.toml gitleaks stosuje PRZED
# czytaniem tresci pliku (zmierzone: podrzucony klucz i blok BEGIN RSA PRIVATE
# KEY w frontend/__tests__/ NIE byly wtedy znajdowane wcale), wiec takiego
# wyciszenia tu nie ma. Brak pliku odciskow = brak flagi, nie blad.
# Siec wylaczona (--network none) i obraz przypiety wersja, nie `latest`.
# Zwraca kod wyjscia dockera/gitleaksa (0 = bez trafien, >0 zwykle = trafienia
# albo blad uruchomienia).
sekrety_uruchom_gitleaks() {
  local katalog_tresci="$1" plik_toml="$2" plik_log="$3"
  local plik_odciskow="${4:-${plik_toml%/*}/.gitleaksignore}"
  local -a montaz_odciskow=()
  local -a flaga_odciskow=()
  # Sciezka windowsowa ("D:\\..." po `wslpath -w`) NIE przejdzie testu `-f` w
  # Linuksie, choc plik istnieje - stad drugi warunek. Bez niego ponowienie
  # (sekrety_uruchom_gitleaks_odporne) gubilo plik odciskow po cichu i wracalo
  # 7 wyciszonych trafien jako "wyciek" - zmierzone 16.09.2026 w WSL.
  if [[ -f "$plik_odciskow" || "$plik_odciskow" =~ ^[A-Za-z]:[\\/] ]]; then
    montaz_odciskow=(-v "${plik_odciskow}:/odciski:ro")
    flaga_odciskow=(--gitleaks-ignore-path /odciski)
  fi
  docker run --rm --network none \
    -v "${katalog_tresci}:/tresc:ro" \
    -v "${plik_toml}:/konfiguracja.toml:ro" \
    "${montaz_odciskow[@]}" \
    ghcr.io/gitleaks/gitleaks:v8.30.1 dir /tresc -c /konfiguracja.toml "${flaga_odciskow[@]}" --no-banner --redact -v -l debug \
    >"$plik_log" 2>&1
}

# sekrety_uruchom_gitleaks_odporne KATALOG_TRESCI PLIK_TOML PLIK_LOG [PLIK_ODCISKOW]
#
# To samo co wyzej, z JEDNYM ponowieniem dla srodowisk, w ktorych `docker` na
# PATH jest wrapperem do `docker.exe` (Windows) i NIE tlumaczy sciezek
# "/mnt/<litera>/..." ani "/d/...". Objawy sa dwa i oba znacza to samo -
# "skaner nie dostal tego, co mu dano":
#   - "scanned ~0 bytes" (montaz wyszedl pusty),
#   - BRAK linii "scanned" w ogole (np. "unable to load gitleaks config, err:
#     read /konfiguracja.toml: is a directory" - docker zalozyl katalog w
#     miejscu nieistniejacej sciezki zrodlowej).
# Drugi objaw zmierzony 16.09.2026 w WSL uruchamianym przez `bash -lc`: w
# powloce logowania PATH stawia przed natywnym klientem dockera ten windowsowy,
# wiec ten sam skrypt w tej samej dystrybucji raz dziala, raz nie. Poprzednia
# wersja testu ponawiala TYLKO na pierwszym objawie - i na drugim milczala.
# Ponowienie idzie przez `wslpath -w` (gdy jest) na wszystkich trzech
# sciezkach. Zwraca kod ostatniego wykonanego biegu.
sekrety_uruchom_gitleaks_odporne() {
  local katalog_tresci="$1" plik_toml="$2" plik_log="$3" plik_odciskow="${4:-${2%/*}/.gitleaksignore}"
  local kod bajty
  MSYS_NO_PATHCONV=1 sekrety_uruchom_gitleaks "$katalog_tresci" "$plik_toml" "$plik_log" "$plik_odciskow"
  kod=$?
  bajty="$(sekrety_wyciagnij_bajty_skanu "$plik_log")"
  if [[ ! "$bajty" =~ ^[1-9][0-9]*$ ]] && command -v wslpath >/dev/null 2>&1; then
    MSYS_NO_PATHCONV=1 sekrety_uruchom_gitleaks \
      "$(wslpath -w "$katalog_tresci")" "$(wslpath -w "$plik_toml")" "$plik_log" "$(wslpath -w "$plik_odciskow")"
    kod=$?
  fi
  return "$kod"
}

# sekrety_pliki_pominiete PLIK_LOG
#
# zbior plikow, ktore gitleaks SAM zglosil jako pominiete - NIE
# lista wpisana na sztywno. Zrodlo to linie debug (patrz -l debug wyzej).
# Zmierzone (16.09.2026) klasy pominiecia w v8.30.1 - TRZY, wszystkie tu:
#   "DBG skipping file: global allowlist path=/tresc/<sciezka>"
#   "DBG skipping empty file path=/tresc/<sciezka>"
#   "DBG skipping binary file mime_type=<typ> path=/tresc/<sciezka>"
# Trzecia klasa kosztowala falszywy alarm: czcionka woff2 pod rozszerzeniem
# ".fnt" jest przez skaner pomijana po ROZPOZNANYM MIME (nie po nazwie),
# a funkcja zwracala ja jako skanowana - 609 760 B takich plikow zbijalo
# pokrycie i zatrzymywalo bramke BEZ ZADNEGO WYCIEKU.
# Kody ANSI (kolory) sa zdejmowane PRZED wyciaganiem sciezki, bo inaczej
# `path=` i wartosc rozdziela sekwencja ucieczki i zwykly grep jej nie zlapie.
# Prefiks montazu "/tresc/" jest sciety, zeby zwrocic sciezki wzgledne do
# korzenia eksportu.
#
# Wypisuje na stdout jedna sciezke na linie, W KOLEJNOSCI Z LOGU I BEZ
# ODDUPLIKOWANIA (powtorzenie ma byc widoczne dla `sekrety_oczekiwane_bajty`,
# ktore je zglasza jako log niewiarygodny). Kod wyjscia zawsze 0.
sekrety_pliki_pominiete() {
  local log="$1"
  sed -E $'s/\x1b\[[0-9;]*m//g' "$log" \
    | grep -aE 'DBG skipping (file: global allowlist|empty file|binary file) ' \
    | grep -aoE 'path=/tresc/.*' \
    | sed 's#^path=/tresc/##'
  return 0
}

# sekrety_pominiete_nierozpoznane PLIK_LOG
#
# Kontrola ZUPELNOSCI - wypisuje te linie "DBG skipping ...", ktorych nie
# umiemy zaklasyfikowac - czyli kolejna klasa pominiecia, o ktorej nie wiemy.
# Zmierzone 16.09.2026 na v8.30.1: linii "DBG skipping" sa CZTERY rodzaje. Trzy
# dotycza PLIKU (global allowlist, pusty plik, plik binarny po MIME) i wchodza
# do zbioru wyzej. Czwarty - "DBG skipping finding: global fingerprint
# finding=... fingerprint=<odcisk>" - dotyczy POJEDYNCZEGO TRAFIENIA wyciszonego
# po odcisku z .gitleaksignore: plik jest wtedy CZYTANY I LICZONY do "scanned ~N
# bytes", wiec zbioru pominietych NIE powieksza (gdyby wszedl, oczekiwane byloby
# zanizone o cale pliki). Dlatego jest tu znany-i-pominiety, a nie nierozpoznany.
# Ta kontrola zlapala go sama, przy pierwszym biegu po wprowadzeniu odciskow. Pusto = suma trzech znanych klas
# pokrywa wszystko, co skaner zglosil. Niepusto = NIE ZGADUJEMY: wolajacy ma
# to pokazac i sprawdzenie pokrycia ma byc czerwone, bo od tej chwili
# "oczekiwane" liczy pliki, ktorych skaner nie ogladal.
sekrety_pominiete_nierozpoznane() {
  local log="$1"
  sed -E $'s/\x1b\[[0-9;]*m//g' "$log" \
    | grep -a 'DBG skipping ' \
    | grep -avE 'DBG skipping (file: global allowlist|empty file|binary file) ' \
    | grep -av 'DBG skipping finding: '
  return 0
}

# sekrety_bajtow_zbioru KATALOG_EKSPORTU
#
# Czyta ze STDIN sciezki wzgledne (jak z sekrety_pliki_pominiete), jedna na
# linie, i sumuje ich rozmiary Z TEGO SAMEGO STRUMIENIA, ktory czytal skaner -
# czyli z rozpakowanego eksportu (`git archive` + `tar`), a NIE z `git ls-tree`.
#
# Dlaczego nie `git ls-tree` (rozstrzygniecie 16.09.2026): `.gitattributes` ma regule
# `*.ps1 text eol=crlf`, wiec `git archive` doklada CR-y - `scripts/pokaz.ps1`
# blob 1 249 B -> eksport 1 283 B, `scripts/setup.ps1` 1 963 -> 1 999. "Zmierzone"
# i "oczekiwane" liczyly wtedy INNE BAJTY tych samych plikow (staly niedomiar
# 70 B, ktory zmienia sie przy kazdej edycji pliku .ps1) - i to bylo zaklejane
# progiem procentowym. Po przejsciu na rozmiary z eksportu roznica ZNIKA, wiec
# porownanie moze byc DOKLADNE, bez zadnego progu "na oko".
#
# Sciezki powtorzone sa liczone TYLE RAZY, ILE RAZY PRZYSZLY - odduplikowanie
# (i odmowa przy powtorce) nalezy do `sekrety_oczekiwane_bajty` nizej, zeby
# powtorka nie znikla po cichu. Sciezki nieistniejace w eksporcie sa pomijane.
# Wypisuje sume (0, gdy STDIN byl pusty), kod wyjscia zawsze 0.
sekrety_bajtow_zbioru() {
  local katalog="$1" suma=0 plik rozmiar
  while IFS= read -r plik; do
    [[ -z "$plik" ]] && continue
    rozmiar="$(stat -c %s "$katalog/$plik" 2>/dev/null)"
    [[ "$rozmiar" =~ ^[0-9]+$ ]] && suma=$((suma + rozmiar))
  done
  echo "$suma"
  return 0
}

# sekrety_bajtow_eksportu KATALOG_EKSPORTU
#
# Suma rozmiarow WSZYSTKICH plikow w rozpakowanym eksporcie - pelna miara tego
# samego strumienia, ktory dostal skaner (patrz wyzej, dlaczego nie ls-tree).
sekrety_bajtow_eksportu() {
  local katalog="$1"
  find "$katalog" -type f -printf '%s\n' 2>/dev/null | awk '{s+=$1} END{print s+0}'
}

# sekrety_oczekiwane_bajty KATALOG_EKSPORTU PLIK_LOG
#
# Ile bajtow gitleaks POWINIEN byl obejrzec: wszystko z eksportu MINUS to, co
# sam zglosil jako pominiete. Wypisuje JEDNA liczbe (stdout) i konczy sie 0
# TYLKO wtedy, gdy ta liczba da sie obronic. ODMAWIA (kod 1, komunikat na
# stdout zamiast liczby) w trzech przypadkach - to sa dokladnie te drogi,
# ktorymi asercje dalo sie dotad wylaczyc OD SRODKA:
#   1. log ma linie "DBG skipping", ktorej nie znamy (czwarta klasa) - wtedy
#      "pominiete" jest niepelne i kazda liczba bylaby zgadywaniem;
#   2. ta sama sciezka pominieta WIECEJ NIZ RAZ - kazde powtorzenie obnizalo
#      poprzeczke o rozmiar pliku (zmierzone: 683 990 B przy pliku 341 995 B),
#      wiec powtorka = log niewiarygodny, nie "zbior troche wiekszy";
#   3. wynik <= 0 albo zbior pominietych obejmuje CALY eksport - "oczekiwane 0"
#      NIE jest zgodnoscia, tylko wylaczona kontrola.
sekrety_oczekiwane_bajty() {
  local katalog="$1" log="$2" pelne pominiete_b surowo_n unikalnie_n plikow_n pominietych_n nierozpoznane
  nierozpoznane="$(sekrety_pominiete_nierozpoznane "$log")"
  if [[ -n "$nierozpoznane" ]]; then
    echo "sekrety: ODMOWA wyliczenia oczekiwanych bajtow - log ma nierozpoznana klase pominiecia (pierwsza taka linia: $(printf '%s' "$nierozpoznane" | head -1))"
    return 1
  fi
  surowo_n="$(sekrety_pliki_pominiete "$log" | grep -c . )"
  unikalnie_n="$(sekrety_pliki_pominiete "$log" | sort -u | grep -c . )"
  if [[ "$surowo_n" -ne "$unikalnie_n" ]]; then
    echo "sekrety: ODMOWA wyliczenia oczekiwanych bajtow - zbior pominietych ma powtorzone sciezki ($surowo_n linii, $unikalnie_n unikalnych) - log niewiarygodny"
    return 1
  fi
  pelne="$(sekrety_bajtow_eksportu "$katalog")"
  pominiete_b="$(sekrety_pliki_pominiete "$log" | sort -u | sekrety_bajtow_zbioru "$katalog")"
  plikow_n="$(find "$katalog" -type f 2>/dev/null | wc -l)"
  pominietych_n="$unikalnie_n"
  if [[ "$pominietych_n" -ge "$plikow_n" ]]; then
    echo "sekrety: ODMOWA wyliczenia oczekiwanych bajtow - skaner zglasza jako pominiete $pominietych_n z $plikow_n plikow eksportu, czyli nie zostaje nic do sprawdzenia"
    return 1
  fi
  if [[ $(( pelne - pominiete_b )) -le 0 ]]; then
    echo "sekrety: ODMOWA wyliczenia oczekiwanych bajtow - po odjeciu pominietych zostaje $(( pelne - pominiete_b )) B (pelne=$pelne, pominiete=$pominiete_b) - to nie jest zgodnosc, tylko wylaczona kontrola"
    return 1
  fi
  echo "$(( pelne - pominiete_b ))"
  return 0
}

# sekrety_eksportuj_tresc REV KATALOG_DOCELOWY
#
# Eksportuje tresc sledzona przez git (`git archive`) na commicie REV do
# KATALOG_DOCELOWY (ktory ma juz istniec, pusty). Wypisuje na stdout LICZBE
# wyeksportowanych plikow i konczy sie kodem 0 - TYLKO gdy `git archive`
# powiodl sie I eksport ma co najmniej 1 plik.
#
# W obu pozostalych przypadkach:
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
  # Oba czlony potoku sprawdzone WPROST z PIPESTATUS - nie tylko [0]:
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
# NAPRAWDE obejrzal.
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

# sekrety_sprawdz_pokrycie PLIKOW_ZM BAJTOW_ZM PLIKOW_OCZ BAJTOW_OCZ [KATALOG_EKSPORTU] [REV]
#
# Porownuje to, co gitleaks NAPRAWDE obejrzal (PLIKOW_ZM z eksportu, BAJTOW_ZM
# z jego loga "scanned ~N bytes"), z liczbami policzonymi NIEZALEZNIE:
# PLIKOW_OCZ z `git ls-tree` (inny przyrzad niz eksport - strumien
# przyciety do 0,8% tresci tez daje "N > 0"), BAJTOW_OCZ z
# `sekrety_oczekiwane_bajty` (eksport minus to, co skaner sam zglosil jako
# pominiete).
#
# Rozstrzygniecie 16.09.2026: porownanie bajtow jest DOKLADNE, tolerancja 0 B. Progu
# procentowego NIE MA - kazdy taki prog byl zgadywaniem, a zgadywanie mielismy
# USUNAC. Przy 99% falszywy alarm wracal od ok. 44 kB zwyklych binariow, przy
# 90% chowal sie prawdziwy ubytek 400 kB. Warunkiem dokladnosci jest liczenie
# obu stron z TEGO SAMEGO strumienia (patrz sekrety_bajtow_zbioru) - stale
# +70 B z CR-ow dokladanych przez `git archive` znikaja same, nie sa odejmowane
# na sztywno.
#
# BAJTOW_OCZ <= 0 to ODMOWA, nie zgodnosc: "oczekiwano 0 bajtow, obejrzano
# 0 bajtow" bylo dotad zielone i tym wlasnie dalo sie asercje wylaczyc od srodka.
# Brak KTOREJKOLWIEK liczby na wejsciu (pusty string, "NIEZMIERZONE", komunikat
# odmowy z sekrety_oczekiwane_bajty) = przyrzad nie dziala = czerwone, NIGDY
# "pewnie dobrze".
#
# KATALOG_EKSPORTU i REV sa opcjonalne i sluza WYLACZNIE do NAZWANIA plikow,
# ktore sie rozjechaly (przy roznicy liczby plikow) - wynik bez nich jest ten sam.
#
# Wypisuje jedna linie, kod wyjscia: 0 = pokrycie zgodne, 1 = kazdy inny przypadek.
sekrety_sprawdz_pokrycie() {
  local plikow_zm="$1" bajtow_zm="$2" plikow_ocz="$3" bajtow_ocz="$4" katalog="${5:-}" rev="${6:-}" roznica nazwane

  if [[ ! "$plikow_zm" =~ ^[0-9]+$ || ! "$bajtow_zm" =~ ^[0-9]+$ ]]; then
    echo "sekrety: pokrycie eksportu NIEZMIERZONE - brak odczytu liczby plikow lub bajtow ze skanu (plikow='$plikow_zm' bajtow='$bajtow_zm')"
    return 1
  fi
  if [[ ! "$plikow_ocz" =~ ^[0-9]+$ || ! "$bajtow_ocz" =~ ^[0-9]+$ ]]; then
    echo "sekrety: pokrycie eksportu NIEZMIERZONE - brak odczytu niezaleznie policzonej liczby plikow lub bajtow (plikow='$plikow_ocz' bajtow='$bajtow_ocz')"
    return 1
  fi
  if [[ "$bajtow_ocz" -le 0 ]]; then
    echo "sekrety: pokrycie eksportu ODMOWA - oczekiwane 0 bajtow nie jest zgodnoscia, tylko wylaczona kontrola"
    return 1
  fi

  if [[ "$plikow_zm" -ne "$plikow_ocz" ]]; then
    nazwane=""
    if [[ -n "$katalog" && -n "$rev" ]]; then
      nazwane="$(comm -3 \
        <(cd "$katalog" && find . -type f 2>/dev/null | sed "s#^[.]/##" | sort) \
        <(git ls-tree -r --name-only "$rev" 2>/dev/null | sort) \
        | tr -d "\t" | head -5 | tr "\n" " ")"
    fi
    echo "sekrety: pokrycie eksportu NIEZGODNE - plikow zmierzone=$plikow_zm, oczekiwane (git ls-tree)=$plikow_ocz${nazwane:+, rozjechane pliki (do 5): $nazwane}"
    return 1
  fi

  if [[ "$bajtow_zm" -ne "$bajtow_ocz" ]]; then
    roznica=$(( bajtow_zm - bajtow_ocz ))
    echo "sekrety: pokrycie eksportu NIEZGODNE - bajtow zmierzone=$bajtow_zm, oczekiwane=$bajtow_ocz (roznica ${roznica} B, tolerancja 0) - skaner obejrzal inne bajty niz eksport, ktory mu dano"
    return 1
  fi

  echo "sekrety: pokrycie eksportu ZGODNE - plikow $plikow_zm/$plikow_ocz, bajtow $bajtow_zm/$bajtow_ocz co do bajta (tolerancja 0)"
  return 0
}
