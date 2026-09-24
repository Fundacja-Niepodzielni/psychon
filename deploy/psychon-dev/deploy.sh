#!/usr/bin/env bash
# Wdrozenie srodowiska odbiorczego psychon-dev na hoscie Fundacji.
#
# Rozni sie od deploy/oracle/deploy.sh trzema rzeczami:
#   1. plik srodowiskowy lezy POZA repozytorium (/opt/psychon/.env, prawa 600),
#   2. nie ma etykiet `traefik.enable=false` - nie ma Traefika,
#   3. przed uruchomieniem sprawdza certyfikat Origin CA, bo bez niego Caddy
#      wstaje i natychmiast pada, a przyczyna widoczna jest dopiero w logu.
#
# Skrypt nie tworzy zadnych sekretow. Plik /opt/psychon/.env zaklada czlowiek.
#
# Krok zrzutu bazy przed migracja (nizej) porownuje liczbe tabel zapisanych
# w zrzucie z liczba tabel w samej bazie. Gdy obie liczby sa znane, ale sie
# roznia, caly bieg konczy sie WLASNYM kodem wyjscia 2 - poza 0/1 i poza
# zakresem 40-47 (ten zakres nalezy do deploy/wdroz-zdalnie.sh, ten plik go
# nie uzywa) - PRZED migracja. Gdy ktorejs z dwoch liczb nie da sie policzyc,
# to jest osobny wynik ("nie wiem"), nigdy ciche zaliczenie zgodnosci.
#
# Funkcje `_swiadek_logowania_*` nizej ocenia sciezke logowania:
# nie tylko trase, ale przekierowanie do dostawcy tozsamosci az do formularza.
# Sa zdefiniowane PRZED `set -euo pipefail` i przed reszta skryptu, a zaraz
# pod nimi stoi warunek, ktory konczy plik, gdy jest ZRODLOWANY (a nie
# wykonany) - dzieki temu testy licza `source deploy.sh` i wolaja funkcje na
# spreparowanych danych, bez uruchamiania prawdziwego wdrozenia.
_swiadek_logowania_url_decode() {
  local zakodowany="${1//+/ }"
  printf '%b' "${zakodowany//%/\\x}"
}

# Argumenty: 1=nazwa klucza (np. AUTH_KEYCLOAK_ISSUER), 2=plik .env. Wypisuje
# odczytana wartosc na stdout (wolajacy sam decyduje, co z nia zrobi - ta
# funkcja NIGDY jej nie drukuje na ekran/log). Bierze OSTATNIA pasujaca
# linie, zdejmuje otaczajace cudzyslowy/apostrofy i koncowe \r (plik .env
# bywa kopiowany z Windows, a compose dopuszcza wartosci w cudzyslowach).
# Brak klucza NIE jest bledem skladni: zwraca 1, a wolajacy - zawsze w
# `if` - decyduje, co dalej. Dzieki temu brakujacy klucz nie przerywa
# wdrozenia pod `set -euo pipefail` (samo przypisanie `x="$(...)"` bez
# `if`/`||` przerwaloby skrypt, gdy funkcja zwroci niezerowy kod).
_swiadek_logowania_czytaj_klucz() {
  local klucz="$1" plik="$2" linia wartosc
  linia="$(grep -E "^${klucz}=" "$plik" 2>/dev/null | tail -n1 || true)"
  if [[ -z "$linia" ]]; then
    return 1
  fi
  wartosc="${linia#*=}"
  wartosc="${wartosc%$'\r'}"
  case "$wartosc" in
    \"*\") wartosc="${wartosc%\"}"; wartosc="${wartosc#\"}" ;;
    \'*\') wartosc="${wartosc%\'}"; wartosc="${wartosc#\'}" ;;
  esac
  printf '%s' "$wartosc"
}

# Argumenty: 1=ISS (issuer realmu, z AUTH_KEYCLOAK_ISSUER), 2=domena
# psychon-dev, 3=Location z odpowiedzi 302 na POST /api/auth/signin/keycloak,
# 4=kod HTTP odpowiedzi GET tej lokalizacji, 5=plik z cialem tamtej
# odpowiedzi. Nie drukuje tokenow, ciasteczek ani wartosci csrf/state/PKCE -
# wylacznie wynik kazdej assercji. Zwraca 0, gdy wszystkie przeszly, 1 w
# przeciwnym razie.
_swiadek_logowania_ocena() {
  local iss="$1" domena="$2" loc="$3" kod_strony="$4" plik_strony="$5"
  local wynik=0

  # (a) dopasowanie PODCIAGIEM ("*" na koncu) przepuszczalo tez
  # ".../authx-cos-innego". Prefiks musi konczyc sie na "?" (zaczyna sie
  # zapytanie) albo na koncu calego napisu (bez zadnego zapytania) - stad
  # dwa wzorce, nie jeden z gwiazdka na koncu. "?" w wzorcu case jest
  # ESCAPOWANY (`\?`), bo bez tego jest globem dopasowujacym KAZDY jeden znak.
  case "$loc" in
    "$iss"/protocol/openid-connect/auth | "$iss"/protocol/openid-connect/auth\?*)
      echo "  (a) Location zaczyna sie od $iss/protocol/openid-connect/auth: OK" ;;
    *)
      echo "  (a) Location zaczyna sie od $iss/protocol/openid-connect/auth: BLAD"
      wynik=1 ;;
  esac

  # (b) dawne dopasowanie PODCIAGIEM (`*client_id=psychon-web*`)
  # przepuszczalo tez `client_id=psychon-web-evil`, bo szukany napis jest
  # podciagiem dluzszego. Wycinamy caly parametr zapytania (do najblizszego
  # `&` albo konca) i porownujemy go NA ROWNO z oczekiwanym.
  local param_client_id oczekiwany_client_id="client_id=psychon-web"
  param_client_id="$(printf '%s' "$loc" | grep -o 'client_id=[^&]*' || true)"
  if [[ "$param_client_id" == "$oczekiwany_client_id" ]]; then
    echo "  (b) client_id=psychon-web: OK"
  else
    echo "  (b) client_id=psychon-web: BLAD - brak lub inny client_id"
    wynik=1
  fi

  local redirect_zakodowany redirect_odkodowany oczekiwany_redirect
  redirect_zakodowany="$(printf '%s' "$loc" | grep -o 'redirect_uri=[^&]*' | cut -d'=' -f2- || true)"
  redirect_odkodowany="$(_swiadek_logowania_url_decode "$redirect_zakodowany")"
  oczekiwany_redirect="https://$domena/api/auth/callback/keycloak"
  if [[ "$redirect_odkodowany" == "$oczekiwany_redirect" ]]; then
    echo "  (c) redirect_uri == $oczekiwany_redirect: OK"
  else
    echo "  (c) redirect_uri: BLAD - jest '$redirect_odkodowany', oczekiwano '$oczekiwany_redirect'"
    wynik=1
  fi

  local ile_localhost
  ile_localhost="$(printf '%s' "$loc" | grep -oi 'localhost' | wc -l | tr -d ' ' || true)"
  ile_localhost="${ile_localhost:-0}"
  if [[ "$ile_localhost" -eq 0 ]]; then
    echo "  (d) wystapien 'localhost' w Location: 0: OK"
  else
    echo "  (d) wystapien 'localhost' w Location: BLAD - $ile_localhost"
    wynik=1
  fi

  # (e) ta sama wada co (b) - `*code_challenge_method=S256*` jest
  # podciagiem `code_challenge_method=S256x`. Ten sam lek: caly parametr,
  # porownanie na rowno.
  local param_ccm oczekiwany_ccm="code_challenge_method=S256"
  param_ccm="$(printf '%s' "$loc" | grep -o 'code_challenge_method=[^&]*' || true)"
  if [[ "$param_ccm" == "$oczekiwany_ccm" ]]; then
    echo "  (e) code_challenge_method=S256: OK"
  else
    echo "  (e) code_challenge_method=S256: BLAD"
    wynik=1
  fi

  # (f) `grep -c` liczy LINIE pasujace, nie WYSTAPIENIA - dwa
  # formularze w jednej linii dawaly `1`, czyli falszywe OK. `grep -o | wc -l`
  # liczy kazde dopasowanie osobno.
  local ile_formularzy
  ile_formularzy="$(grep -o 'kc-form-login' "$plik_strony" 2>/dev/null | wc -l | tr -d ' ' || true)"
  ile_formularzy="${ile_formularzy:-0}"
  if [[ "$kod_strony" == "200" && "$ile_formularzy" -eq 1 ]]; then
    echo "  (f) GET Location -> 200, kc-form-login x1: OK"
  else
    echo "  (f) GET Location -> ${kod_strony:-BRAK ODPOWIEDZI}, kc-form-login x${ile_formularzy}: BLAD"
    wynik=1
  fi

  return "$wynik"
}

# ISS i domena maja JEDNO zrodlo prawdy - plik `$env_file`
# (na hoscie: /opt/psychon/.env). Skrypt wdrozenia NIE eksportuje tych
# zmiennych w powloce przed wywolaniem `deploy.sh` i nie zaglada do
# srodowiska procesu - swiadek czyta WYLACZNIE plik, ta sama funkcja
# (`_swiadek_logowania_czytaj_klucz`), z ktorej korzysta reszta wdrozenia.
# Pusty klucz w pliku jest PRAWDZIWYM sygnalem niekompletnego `.env`, a nie
# czyms, co ma zaslonic srodowisko powloki - dlatego wolajacy (nizej) sam
# rozroznia dwa rozne zera:
#   rc=1 (z `_swiadek_logowania_czytaj_klucz`) - w pliku nie ma linii
#        "NAZWA=" w ogole ("brak klucza"),
#   rc=0, wartosc pusta - linia "NAZWA=" w pliku jest, ale bez wartosci
#        ("pusta wartosc").
# Historyczna wersja tej funkcji (`_swiadek_logowania_wartosc`)
# sprawdzala NAJPIERW zmienna SRODOWISKA procesu - to bylo poprawne, dopoki
# skrypt wdrozenia rzeczywiscie eksportowal ISS z powloki. Ta zmiana usunela
# to wstrzykiwanie, wiec ta galaz nie ma juz czego odzwierciedlac: kolejne
# jej istnienie tylko ukrywaloby pusty/zly klucz w pliku za przypadkowa
# zmienna w srodowisku wywolujacego (np. w testach albo w powloce operatora).

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
fi

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${PSYCHON_ENV_FILE:-/opt/psychon/.env}"
tls_dir="${PSYCHON_TLS_DIR:-/opt/psychon/tls}"
# Katalog na hoscie (poza kontenerami) na zrzuty calej bazy wykonywane
# tuz przed kazda migracja - patrz komentarz przy kroku migracji nizej.
backup_dir="${PSYCHON_DB_BACKUP_DIR:-/opt/psychon/kopie-bazy}"
compose=(docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.psychon-dev.yml)

# Tryb dzieli ten skrypt na wywolywalne kawalki - domyslnie ("pelny") nic sie
# nie zmienia wzgledem dawnego zachowania. Dwa pozostale tryby istnieja
# WYLACZNIE dla `wdroz-zdalnie.sh --ustaw-czubek`, ktory musi zrobic zrzut
# bazy PRZED checkoutem (checkout stoi POZA tym plikiem, w narzedziu
# wdrozeniowym) - a nie PO nim, jak wychodzi z samego biegu ponizej. `--tylko-zrzut`
# nie dotyka kodu aplikacji (nie buduje, nie podnosi app/queue/frontend/caddy,
# bo to jeszcze STARY kod przed checkoutem) - podnosi WYLACZNIE pgsql (baza
# jest niezalezna od checkoutu repo), robi zrzut i rotacje, i konczy. Wolajacy
# wtedy sam robi checkout, po czym `--bez-zrzutu` odtwarza reszte dawnego
# biegu (budowanie + migracja) bez powtarzania juz zrobionego zrzutu.
tryb="${PSYCHON_TRYB_WDROZENIA:-pelny}"
case "$tryb" in
  pelny|tylko-zrzut|bez-zrzutu) ;;
  *)
    echo "BLAD: nieznany PSYCHON_TRYB_WDROZENIA='$tryb'. Dozwolone: pelny, tylko-zrzut, bez-zrzutu. Przerywam bez zmian."
    exit 1
    ;;
esac

cd "$repo_root"

if [[ ! -f "$env_file" ]]; then
  echo "BLAD: brak $env_file. Wzor: deploy/.env.example. Przerywam bez zmian."
  exit 1
fi

# Prawa sprawdzamy, a nie naprawiamy: plik zaklada wlasciciel hosta i to jego
# decyzja, kto go czyta. Ciche `chmod` ukryloby prawdziwy problem.
prawa="$(stat -c %a "$env_file")"
if [[ "$prawa" != "600" ]]; then
  echo "BLAD: $env_file ma prawa $prawa, wymagane 600. Przerywam bez zmian."
  exit 1
fi

if [[ "$tryb" != "tylko-zrzut" ]]; then
  # Certyfikat Caddy jest potrzebny tylko wtedy, gdy Caddy w ogole wstaje w
  # tym biegu - `--tylko-zrzut` nigdy go nie podnosi.
  for plik in origin.crt origin.key; do
    if [[ ! -s "$tls_dir/$plik" ]]; then
      echo "BLAD: brak $tls_dir/$plik (certyfikat Cloudflare Origin CA). Przerywam bez zmian."
      exit 1
    fi
  done
fi

"${compose[@]}" config --quiet

if [[ "$tryb" = "tylko-zrzut" ]]; then
  echo "Tryb --tylko-zrzut: podnosze WYLACZNIE baze (kod aplikacji jeszcze NIE jest checkoutowany na docelowy commit)..."
  "${compose[@]}" up -d pgsql
else
  echo "Przygotowuje prywatne wolumeny aplikacji..."
  "${compose[@]}" run --rm --no-deps --user 0:0 --entrypoint sh app -lc \
    'mkdir -p vendor storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache && chown -R 33:33 vendor storage bootstrap/cache'

  echo "Instaluje zaleznosci backendu..."
  "${compose[@]}" run --rm --no-deps app \
    composer install --no-interaction --no-dev --prefer-dist --no-progress --optimize-autoloader

  echo "Buduje frontend..."
  "${compose[@]}" build frontend

  echo "Uruchamiam uslugi..."
  "${compose[@]}" up -d pgsql redis mailpit
  # Frontend powstaje jako niezmienny obraz, wiec dzialajacy kontener zachowuje
  # kompletny poprzedni build az do chwili pomyslnego utworzenia nowego obrazu.
  # Procesy Laravel sa odtwarzane, zeby workery i OPcache nie trzymaly starego kodu.
  "${compose[@]}" up -d --force-recreate app queue scheduler frontend
  # Caddyfile jest montowany jako pojedynczy plik: `git checkout` kladzie nowy
  # plik (nowy i-wezel), a dzialajacy kontener dalej widzi stary. Przy
  # `admin off` nie ma tez przeladowania z zewnatrz. Samo `up -d` zostawia
  # kontener, bo jego definicja sie nie zmienila - tak zmiana tras logowania
  # nie weszla przy pierwszym wdrozeniu. Kilka sekund przerwy na 443 to cena.
  "${compose[@]}" up -d --force-recreate caddy
fi

if [[ "$tryb" = "bez-zrzutu" ]]; then
  echo "Tryb --bez-zrzutu: zrzut i rotacja juz zrobione wczesniej (przed checkoutem) - pomijam ten krok."
fi
if [[ "$tryb" != "bez-zrzutu" ]]; then
echo "Zrzucam kopie calej bazy przed migracja..."
# Kolejnosc zrzut -> migrate -> documents:encrypt-snapshots jest wymuszona,
# nie stylistyczna - ale opisuje ja tu FAKTYCZNA kolejnosc kroku wyzej, nie
# zyczeniowa. Kontenery aplikacji sa juz PRZEBUDOWANE na nowy kod
# (`up -d --force-recreate app queue scheduler frontend` powyzej), zanim ten
# zrzut w ogole ruszy - to nie jest wiec "ostatni moment sprzed wdrozenia",
# tylko krotkie okno PO restarcie: przez te kilka sekund aplikacja juz czyta
# `data_snapshot` jako `encrypted:array`, a w tabeli wciaz leza jawne migawki
# sprzed migracji, wiec ich odczyt konczy sie wyjatkiem (nie trescia), dopoki
# nie zadzialaja migrate + documents:encrypt-snapshots nizej. Zrzut i tak
# idzie PRZED migracja, bo to ostatni moment, kiedy stan TABELI (w
# odroznieniu od stanu kontenerow) odpowiada jeszcze kodowi sprzed
# wdrozenia - gdyby cos poszlo nie tak w migracji albo w poleceniu
# szyfrujacym, ta kopia jest jedynym punktem powrotu. Migracja musi wejsc
# PRZED poleceniem, bo dopiero ona zmienia typ kolumny `data_snapshot` z
# `json` na `text` - kolumna typu json odrzucilaby zapis szyfrogramu. A
# polecenie musi wejsc w TYM SAMYM biegu, zaraz po migracji, zeby okno
# nieczytelnych migawek bylo jak najkrotsze.
#
# Nazwa bazy i uzytkownika do pg_dump pochodzi z tych samych zmiennych co
# docker-compose.psychon-dev.yml (`DB_DATABASE`, `DB_USERNAME`), z tym samym
# domyslnym "niepodzielni" - inna wartosc w env_file nie moze rozjechac
# zrzutu z tym, na czym faktycznie stoi baza kontenera.
db_name="$(_swiadek_logowania_czytaj_klucz "DB_DATABASE" "$env_file" || true)"
db_name="${db_name:-niepodzielni}"
db_user="$(_swiadek_logowania_czytaj_klucz "DB_USERNAME" "$env_file" || true)"
db_user="${db_user:-niepodzielni}"

mkdir -p "$backup_dir"
# Autorstwo jest ZAPISEM, nie ksztaltem nazwy: nazwa z tym samym czlonem
# ("psychondev") jest tylko konwencja czytelna dla czlowieka - obcy plik
# moze nazywac sie identycznie, przez przypadek albo naumyslnie, i wtedy
# konwencja klamie. Prawdziwym dowodem autorstwa jest ten rejestr: wiersz
# dopisany PRZEZ TEN SKRYPT zaraz po udanym zrzucie, z suma kontrolna
# policzona z tresci, ktora pg_dump wlasnie napisal. Rotacja nizej czyta
# WYLACZNIE ten rejestr i przed kasowaniem porownuje sume NA NOWO, wiec
# zgodnosc samej nazwy nigdy nie wystarcza do usuniecia pliku.
rejestr_zrzutow="$backup_dir/.rejestr-psychondev-zrzutow.tsv"
# Czlon "pelna-baza" odroznia ten format od dawnego jednotabelowego
# ("documents-psychondev-...") - dwa ksztalty nazwy nigdy nie powstaja z
# tego samego biegu skryptu, wiec rejestr od teraz przyjmuje wylacznie ten
# nowy ksztalt.
backup_file="$backup_dir/pelna-baza-psychondev-$(date +%Y%m%d-%H%M%S).sql"
# `umask 077` w podpowloce, zanim pg_dump zacznie pisac - plik dostaje prawa
# 600 OD PIERWSZEGO bajtu tresci (dane osobowe sa w nim jawne az do
# pierwszego udanego przebiegu documents:encrypt-snapshots), nie dopiero po
# fakcie. Zrzut jest CALEJ bazy (bez `-t`) - jednotabelowy zrzut zostawial
# poza kopia 42 z 43 tabel.
if ! (umask 077 && "${compose[@]}" exec -T pgsql pg_dump -U "$db_user" -d "$db_name" > "$backup_file"); then
  echo "BLAD: zrzut calej bazy (pg_dump) nie powiodl sie. Przerywam bez migracji."
  rm -f "$backup_file"
  exit 1
fi

# Zrzut, ktory sie "udal" (kod wyjscia pg_dump byl 0), moze wciaz obejmowac
# mniej tabel niz baza naprawde ma - to dokladnie wada, ktora ten krok mial
# naprawic. Liczba tabel W ZRZUCIE liczona jest z tresci, ktora pg_dump
# wlasnie napisal (linie `CREATE TABLE `), liczba tabel W BAZIE - osobnym
# zapytaniem do katalogu bazy, poza schematami systemowymi. Obie liczby
# wypisujemy ZAWSZE, jako osobne wartosci, zanim cokolwiek innego zdecyduje
# o ich zgodnosci.
liczba_tabel_zrzut="$(grep -c -E '^CREATE TABLE ' "$backup_file" 2>/dev/null || true)"
liczba_tabel_baza="$("${compose[@]}" exec -T pgsql psql -U "$db_user" -d "$db_name" -tAc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');" \
  2>/dev/null | tr -d '[:space:]' || true)"
echo "ZRZUT: tabel w zrzucie=${liczba_tabel_zrzut:-brak} tabel w bazie=${liczba_tabel_baza:-brak}"

# Rozstrzygniecie ma TRZY drogi, nie dwie: zgodne, niezgodne, i "nie da sie
# policzyc". Trzecia droga NIE jest cicho skladana z pierwsza - pusty albo
# niecyfrowy wynik ktorejkolwiek liczby NIGDY nie jest liczony jako dowod
# zgodnosci, dostaje wlasny, osobny komunikat.
if [[ "$liczba_tabel_zrzut" =~ ^[0-9]+$ && "$liczba_tabel_baza" =~ ^[0-9]+$ ]]; then
  if [[ "$liczba_tabel_zrzut" -ne "$liczba_tabel_baza" ]]; then
    echo "BLAD: liczba tabel w zrzucie ($liczba_tabel_zrzut) rozni sie od liczby tabel w bazie ($liczba_tabel_baza). Przerywam przed migracja (kod wyjscia 2)."
    rm -f "$backup_file"
    exit 2
  fi
  echo "ZRZUT: liczba tabel w zrzucie i w bazie sie zgadza."
else
  echo "ZRZUT: NIE WIEM - przynajmniej jednej z dwoch liczb tabel nie da sie policzyc. To NIE jest zgodnosc, ale nie przerywa biegu tutaj."
fi

# Suma liczona ZARAZ PO udanym zrzucie - jedyny moment pewnosci, ze plik na
# dysku to dokladnie to, co pg_dump napisal. Bez sumy nie ma wpisu w
# rejestrze: nowy plik zostaje na dysku, ale rotacja nigdy go nie skasuje
# (nie bedzie go w rejestrze) - bezpieczny kierunek zamiast zgadywania.
suma_nowego="$(sha256sum -- "$backup_file" 2>/dev/null | awk '{print $1}' || true)"
if [[ -e "$rejestr_zrzutow" && ! -f "$rejestr_zrzutow" ]]; then
  # NIE WIEM juz tutaj, nie dopiero przy rotacji: cos lezy pod ta nazwa, ale
  # nie jest zwyklym plikiem, wiec dopisanie do niego byloby zgadywaniem.
  # Nowy zrzut zostaje na dysku (pg_dump juz sie udal), ale bez wpisu w
  # rejestrze rotacja nigdy go nie ruszy - bezpieczny kierunek.
  echo "OSTRZEZENIE: NIE WIEM - pod nazwa rejestru $rejestr_zrzutow lezy cos, co nie jest zwyklym plikiem. NIE dopisuje nowej pozycji."
elif [[ -z "$suma_nowego" ]]; then
  echo "OSTRZEZENIE: nie udalo sie policzyc sumy kontrolnej $backup_file - NIE dopisuje go do rejestru wlasnych zrzutow (zostaje na dysku, rotacja go nigdy nie ruszy)."
else
  printf '%s\t%s\n' "$(basename "$backup_file")" "$suma_nowego" >> "$rejestr_zrzutow"
fi

# Rotacja czyta WYLACZNIE rejestr, nigdy katalog - lista kandydatow do
# skasowania to pozycje w rejestrze ponad siedem najnowszych, NIE wynik
# przeszukania nazw plikow. Kazda pozycja ma TRZY mozliwe wyniki, nie dwa:
# SKASOWANO (plik istnieje, suma zgadza sie z zapisana), NIC-DO-ZROBIENIA
# (pozycja jest, pliku juz nie ma - ktos go usunal recznie, nie nasza
# sprawa), NIE WIEM (plik jest, ale tresc/suma sie nie zgadza, albo nie da
# sie jej policzyc). NIE WIEM nigdy nie kasuje, zawsze zostawia wlasny
# wiersz w logu i nigdy nie jest cicho skladane z ktorymkolwiek z dwoch
# pozostalych wynikow - w tym takze wtedy, gdy sam rejestr nie daje sie
# odczytac (np. urwany zapis, brak uprawnien, albo cos innego niz zwykly
# plik lezy pod ta nazwa): brak odpowiedzi to NIE WIEM, nigdy "nic do
# skasowania".
if [[ ! -e "$rejestr_zrzutow" ]]; then
  echo "ROTACJA ZRZUTOW: rejestr jeszcze nie istnieje - to pierwszy zrzut tego instrumentu w tym katalogu, nic do rotacji."
elif [[ ! -f "$rejestr_zrzutow" || ! -r "$rejestr_zrzutow" ]]; then
  echo "ROTACJA ZRZUTOW: NIE WIEM - rejestr istnieje pod ta nazwa, ale nie da sie go odczytac jako zwykly plik (uprawnienia albo inny typ pliku). Nic nie kasuje, katalog kopii zostaje jak jest."
else
  mapfile -t wiersze_rejestru < "$rejestr_zrzutow"
  liczba_wpisow="${#wiersze_rejestru[@]}"
  echo "ROTACJA ZRZUTOW: rejestr ma $liczba_wpisow pozycji."
  if [[ "$liczba_wpisow" -le 7 ]]; then
    echo "ROTACJA ZRZUTOW: $liczba_wpisow <= 7, nic do skasowania."
  else
    ile_do_usuniecia=$((liczba_wpisow - 7))
    nowy_rejestr="$(mktemp)"
    skasowano=0
    nie_wiem=0
    nic_do_zrobienia=0
    i=0
    for wiersz in "${wiersze_rejestru[@]}"; do
      i=$((i + 1))
      nazwa="${wiersz%%$'\t'*}"
      suma_rejestru="${wiersz#*$'\t'}"
      sciezka="$backup_dir/$nazwa"
      if [[ "$i" -gt "$ile_do_usuniecia" ]]; then
        # Wsrod siedmiu najnowszych pozycji rejestru - zostaje, nietkniety.
        printf '%s\n' "$wiersz" >> "$nowy_rejestr"
        continue
      fi
      if [[ ! -e "$sciezka" ]]; then
        echo "  ROTACJA: NIC-DO-ZROBIENIA - '$nazwa' jest w rejestrze, ale juz go nie ma na dysku. Zdejmuje pozycje z rejestru."
        nic_do_zrobienia=$((nic_do_zrobienia + 1))
        continue
      fi
      suma_teraz="$(sha256sum -- "$sciezka" 2>/dev/null | awk '{print $1}' || true)"
      if [[ -z "$suma_teraz" ]]; then
        echo "  ROTACJA: NIE WIEM - nie udalo sie policzyc sumy '$nazwa'. Zostawiam plik I pozycje w rejestrze - nie kasuje, gdy nie wiem na pewno."
        nie_wiem=$((nie_wiem + 1))
        printf '%s\n' "$wiersz" >> "$nowy_rejestr"
        continue
      fi
      if [[ "$suma_teraz" != "$suma_rejestru" ]]; then
        echo "  ROTACJA: NIE WIEM - '$nazwa' jest w rejestrze, ale tresc na dysku juz NIE zgadza sie z zapisana suma (nazwa nie jest juz dowodem). Zostawiam plik, zdejmuje pozycje z rejestru."
        nie_wiem=$((nie_wiem + 1))
        continue
      fi
      rm -f -- "$sciezka"
      skasowano=$((skasowano + 1))
      echo "  ROTACJA: SKASOWANO '$nazwa' (pozycja $i z $liczba_wpisow, suma zgodna)."
    done
    mv -f "$nowy_rejestr" "$rejestr_zrzutow"
    pozostalo_w_rejestrze="$(grep -c . "$rejestr_zrzutow" || true)"
    echo "ROTACJA ZRZUTOW: skasowano=$skasowano nie-wiem=$nie_wiem nic-do-zrobienia=$nic_do_zrobienia pozostaje-w-rejestrze=$pozostalo_w_rejestrze"
  fi
fi
fi

if [[ "$tryb" = "tylko-zrzut" ]]; then
  # Zrzut (i jego rotacja) sa jedynym zadaniem tego trybu - kod aplikacji
  # jeszcze nie jest na docelowym commicie, wiec migracja/budowanie/swiadkowie
  # ponizej NIE MOGA tu ruszyc (dzialalyby na STARYM kodzie).
  echo "Tryb --tylko-zrzut: zrzut zakonczony, konczy sie tutaj (bez migracji, bez budowania)."
  exit 0
fi

echo "Migracje i cache konfiguracji..."
"${compose[@]}" exec -T app php artisan migrate --force
echo "Szyfruje pozostale jawne migawki dokumentow..."
"${compose[@]}" exec -T app php artisan documents:encrypt-snapshots
"${compose[@]}" exec -T app php artisan optimize

echo "Status uslug:"
"${compose[@]}" ps

# Swiadek: rozdzial ruchu sprawdzamy PRZEZ Caddy na tym hoscie, zanim
# ktokolwiek sprobuje wejsc z zewnatrz. Inaczej pierwszym przyrzadem bylaby
# przegladarka za Cloudflare Access, czyli trzy warstwy naraz.
# `curl --resolve` laczy sie z 127.0.0.1:443 pod nazwa domeny, czyli z tym
# samym TLS i ta sama nazwa co prawdziwy klient. Pierwsza wersja (`wget` z
# wnetrza kontenera Caddy po adresie IP) laczyla sie bez nazwy w TLS i Caddy
# zrywal polaczenie (alert TLS 80) - na kazdej sciezce "BRAK ODPOWIEDZI", takze
# przy stojacych uslugach. `--retry` przeczekuje 502/503, dopoki uslugi wstaja.
echo "Swiadek rozdzialu ruchu (przez Caddy na 127.0.0.1:443):"
# JEDNO zrodlo - plik $env_file, ta sama funkcja, ktora czyta
# wszystkie inne ustawienia wdrozenia. Zaden odczyt srodowiska procesu.
domena=""
rc_domena=0
domena="$(_swiadek_logowania_czytaj_klucz "STAGING_DOMAIN" "$env_file")" || rc_domena=$?
if [[ "$rc_domena" -ne 0 ]]; then
  echo "  OSTRZEZENIE: brak STAGING_DOMAIN w $env_file - ponizsze proby polacza sie bez nazwy domeny."
elif [[ -z "$domena" ]]; then
  echo "  OSTRZEZENIE: STAGING_DOMAIN w $env_file jest puste - ponizsze proby polacza sie bez nazwy domeny."
fi
# `/api/v1/me` bez tokenu ma zwrocic 401 Z LARAVELA - to dowodzi, ze odpowiedzial
# backend, a nie Next.js (ktory na tej sciezce dalby 404). `/` ma dac 200 z Next.
# `/api/auth/providers` ma dac 200 Z NEXT (next-auth) - 404 znaczy, ze `/api/*`
# znow oddal trasy logowania Laravelowi i przycisk "Zaloguj przez Konta" nie dziala.
# Kod HTTP czytamy z `-w`, a nie z kodu wyjscia: oczekiwany wynik `/api/v1/me`
# to 401, a swiadek nie moze przerwac skryptu pod `set -e` - `|| true`.
# `000` znaczy: brak odpowiedzi po wszystkich probach.
for sciezka in /api/v1/me /api/auth/providers /; do
  kod="$(curl -sk --resolve "$domena:443:127.0.0.1" --retry 15 --retry-connrefused --retry-delay 2 \
    --max-time 20 -o /dev/null -w '%{http_code}' "https://$domena$sciezka" || true)"
  echo "  $sciezka -> ${kod:-BRAK ODPOWIEDZI}"
done

# Swiadek sciezki logowania: trasa wyzej dowodzi tylko, ze
# /api/* trafia do Next.js - nie dowodzi, ze przycisk "Zaloguj" naprawde
# prowadzi do Kont i wraca. Ten swiadek idzie caly ten szlak: CSRF, POST
# signin/keycloak, przekierowanie do realmu (przez nasz Caddy, tak jak trasa
# wyzej), a na koniec sam formularz logowania - JUZ PO PRAWDZIWEJ SIECI, bez
# `--resolve`, bo to jedyny punkt, w ktorym realm naprawde weryfikuje
# redirect_uri. Lapie z automatu trzy znane wady: proxy nie routujace
# /api/auth/* na frontend, realm bez tego przekierowania na liscie klienta i
# aplikacje wysylajaca origin `localhost:3000` zamiast publicznej domeny.
# Ciasteczka i naglowki w mktemp, sprzatane trapem; token csrf, ciasteczka i
# stan PKCE nigdzie nie trafiaja do wyjscia - tylko dlugosci i kody HTTP.
# NIEZALICZONY nie przerywa wdrozenia (ten sam wybor co swiadek rozdzialu
# ruchu wyzej): to pomiar biegnacy PO tym, jak uslugi juz staja, w tym jeden
# krok po prawdziwej sieci bez wlasnych ponowien - twardy `exit` zmienialby
# przejsciowa usterke sieci u zewnetrznego IdP w falszywie czerwone
# wdrozenie. Wynik i tak jest widoczny na ostatniej linii ponizej.
echo "Swiadek sciezki logowania (Caddy 127.0.0.1:443, IdP po prawdziwej sieci):"
# JEDNO zrodlo prawdy dla ISS - plik $env_file, wylacznie przez
# `_swiadek_logowania_czytaj_klucz`. Skrypt wdrozenia NIE wstrzykuje juz
# AUTH_KEYCLOAK_ISSUER z powloki, wiec nie ma tu drugiego zrodla do
# uzgadniania - pusty klucz w pliku jest prawdziwym sygnalem niekompletnego
# `.env`, nie czyms do zaslonienia przez srodowisko wywolujacego.
iss=""
rc_iss=0
iss="$(_swiadek_logowania_czytaj_klucz "AUTH_KEYCLOAK_ISSUER" "$env_file")" || rc_iss=$?
if [[ "$rc_iss" -ne 0 ]]; then
  # Brak klucza nie przerywa wdrozenia (ta sama konwencja co reszta tego
  # swiadka): uslugi juz staly, wiec twardy `exit` tutaj tylko ukrylby, ze
  # wdrozenie sie udalo, a jedynie brakuje jednej zmiennej.
  echo "SWIADEK LOGOWANIA: NIEZALICZONY (brak klucza AUTH_KEYCLOAK_ISSUER w $env_file)"
elif [[ -z "$iss" ]]; then
  # Pusta wartosc: ODROZNIONA od braku klucza w komunikacie wyzej. Zaden
  # curl do IdP (ani do naszego /api/auth/csrf czy /api/auth/signin/keycloak)
  # sie tu NIE odbywa - z pustym ISS i tak nie da sie ocenic (a), wiec nie ma
  # czego mierzyc siecia.
  echo "SWIADEK LOGOWANIA: NIEZALICZONY (AUTH_KEYCLOAK_ISSUER w $env_file jest puste)"
else
  ciasteczka_logowania="$(mktemp)"
  naglowki_logowania="$(mktemp)"
  strona_idp="$(mktemp)"
  trap 'rm -f "$ciasteczka_logowania" "$naglowki_logowania" "$strona_idp"' EXIT

  csrf="$(curl -sk --resolve "$domena:443:127.0.0.1" -c "$ciasteczka_logowania" --max-time 20 \
    "https://$domena/api/auth/csrf" 2>/dev/null | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4 || true)"
  echo "  csrf: ${#csrf} znakow (wartosc niewypisywana)"

  curl -sk --resolve "$domena:443:127.0.0.1" -b "$ciasteczka_logowania" -c "$ciasteczka_logowania" \
    -o /dev/null -D "$naglowki_logowania" --max-time 20 -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "callbackUrl=https://$domena/konto" \
    "https://$domena/api/auth/signin/keycloak" || true
  kod_logowania="$(awk 'NR==1{print $2}' "$naglowki_logowania" 2>/dev/null || true)"
  lokalizacja="$(grep -i '^location:' "$naglowki_logowania" 2>/dev/null | head -1 | cut -d' ' -f2- | tr -d '\r' || true)"
  echo "  POST /api/auth/signin/keycloak -> ${kod_logowania:-BRAK ODPOWIEDZI}"

  kod_strony_idp="000"
  : > "$strona_idp"
  case "$lokalizacja" in
    "$iss"/*)
      kod_strony_idp="$(curl -sk -o "$strona_idp" -w '%{http_code}' --max-time 20 "$lokalizacja" || true)"
      ;;
    *) ;;
  esac

  if _swiadek_logowania_ocena "$iss" "$domena" "$lokalizacja" "$kod_strony_idp" "$strona_idp"; then
    echo "SWIADEK LOGOWANIA: ZALICZONY"
  else
    echo "SWIADEK LOGOWANIA: NIEZALICZONY"
  fi
fi

echo "Wdrozenie zakonczone. Nie resetowano bazy ani seedow."
