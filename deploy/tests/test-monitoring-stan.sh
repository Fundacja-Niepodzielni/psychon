#!/usr/bin/env bash
# Test logiki stanu monitoringu (deploy/prod/lib/monitorowanie.sh oraz
# deploy/prod/monitoring.sh) - CZESC BEZ STOSU i bez prawdziwej poczty: dedupe
# "jedno powiadomienie na zmiane stanu" (monitor_ocen_zmiane), odczyt
# zajetosci dysku (monitor_sprawdz_dysk, na atrapie `df`), wysylka maila przez
# atrape `docker` (monitor_wyslij_mail wola `docker compose exec`, nie `curl`
# wprost z hosta - patrz komentarz w monitorowanie.sh) i odpowiedz HTTP na
# atrapie `curl`. Prawdziwa wysylka przez Mailpit i prawdziwy stan kontenerow
# sa mierzone na stosie (pelny bieg, z host-slot.sh), nie tutaj.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
# shellcheck source=deploy/prod/lib/monitorowanie.sh
source "$REPO_ROOT/deploy/prod/lib/monitorowanie.sh"

KATALOG_STANU="$(mktemp -d)"
KATALOG_ATRAPY="$(mktemp -d)"
trap 'rm -rf "$KATALOG_STANU" "$KATALOG_ATRAPY"' EXIT

NIEZALICZONE=0

# sprawdz OPIS RZECZYWISTY OCZEKIWANY - jedno miejsce oceny "zgodne/niezgodne",
# zeby kazdy przypadek nizej mial IDENTYCZNA regule zaliczenia.
sprawdz() {
  local rzeczywisty="$1" oczekiwany="$2"
  if [ "$rzeczywisty" = "$oczekiwany" ]; then
    echo "  WYNIK: ZALICZONY"
  else
    echo "  WYNIK: NIEZALICZONY"
    NIEZALICZONE=$((NIEZALICZONE + 1))
  fi
}

# monitor_ocen_zmiane TYLKO porownuje - NIE zapisuje stanu; zapis stanu robi
# WOLAJACY, i to dopiero PO udanej wysylce, zeby nieudana wysylka nie zgubila
# powiadomienia w ciszy. Test wywoluje wiec zapis osobno, tak jak
# monitoring.sh - `monitor_stan_zapisz` po kazdej ocenie, symulujac "wysylka
# sie powiodla" tam, gdzie w prawdziwym skrypcie bylby mail.

echo "=== 1 pierwsze uruchomienie - PIERWSZY, bez powiadomienia ==="
WYNIK_1="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_1 (oczekiwano PIERWSZY)"
sprawdz "$WYNIK_1" "PIERWSZY"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "dziala"

echo "=== 2 ten sam stan drugi raz - BEZ_ZMIAN ==="
WYNIK_2="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_2 (oczekiwano BEZ_ZMIAN)"
sprawdz "$WYNIK_2" "BEZ_ZMIAN"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "dziala"

echo "=== 3 kontener pada (dziala -> nie_dziala) - ZMIANA ==="
WYNIK_3="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_3 (oczekiwano ZMIANA)"
sprawdz "$WYNIK_3" "ZMIANA"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "nie_dziala"

echo "=== 4 drugie uruchomienie bez zmiany (dalej nie_dziala) - BEZ_ZMIAN, 0 nowych ==="
WYNIK_4="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_4 (oczekiwano BEZ_ZMIAN)"
sprawdz "$WYNIK_4" "BEZ_ZMIAN"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "nie_dziala"

echo "=== 5 kontener wraca (nie_dziala -> dziala) - ZMIANA ('wrocilo') ==="
WYNIK_5="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_5 (oczekiwano ZMIANA)"
sprawdz "$WYNIK_5" "ZMIANA"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "dziala"

echo "=== 5b BEZ zapisu stanu po ZMIANIE - kolejna ocena ZNOWU widzi ZMIANA (dowod na 'ponowienie') ==="
WYNIK_5B="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_5B (oczekiwano ZMIANA)"
sprawdz "$WYNIK_5B" "ZMIANA"
# CELOWO bez monitor_stan_zapisz tutaj - symuluje nieudana wysylke.
WYNIK_5B2="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane (bez zapisu poprzednim razem, ta sama zmiana ponownie): $WYNIK_5B2 (oczekiwano ZMIANA - stan sprzed nieudanej wysylki nie zostal nadpisany)"
sprawdz "$WYNIK_5B2" "ZMIANA"
monitor_stan_zapisz "$KATALOG_STANU" "kontener_app" "nie_dziala"

echo "=== 6 klucze niezalezne - stan 'dysk' nie miesza sie ze stanem 'kontener_app' ==="
WYNIK_6="$(monitor_ocen_zmiane "$KATALOG_STANU" "dysk" "ok")"
echo "  monitor_ocen_zmiane (dysk, pierwszy raz): $WYNIK_6 (oczekiwano PIERWSZY)"
sprawdz "$WYNIK_6" "PIERWSZY"
monitor_stan_zapisz "$KATALOG_STANU" "dysk" "ok"

echo "=== 7 monitor_sprawdz_dysk odczytuje procent z atrapy df ==="
cat > "$KATALOG_ATRAPY/df" <<'EOF_DF'
#!/usr/bin/env bash
echo "Filesystem     1K-blocks     Used Available Use% Mounted on"
echo "/dev/testowy    10000000  9300000    700000  93% /var/backups/psychon"
EOF_DF
chmod +x "$KATALOG_ATRAPY/df"
PROCENT="$(PATH="$KATALOG_ATRAPY:$PATH" monitor_sprawdz_dysk /var/backups/psychon)"
echo "  monitor_sprawdz_dysk: $PROCENT (oczekiwano 93)"
sprawdz "$PROCENT" "93"

echo "=== 8 monitor_wyslij_mail bez adresu odbiorcy NIE wywoluje docker ==="
PLIK_WYWOLAN_DOCKER="$(mktemp)"
cat > "$KATALOG_ATRAPY/docker" <<EOF_DOCKER
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PLIK_WYWOLAN_DOCKER"
case "\$*" in
  *"ps --status running"*) echo "app"; exit 0 ;;
  *"exec -T"*) cat > /dev/null; exit "\${ATRAPA_MAIL_EXIT:-0}" ;;
esac
exit 1
EOF_DOCKER
chmod +x "$KATALOG_ATRAPY/docker"
: > "$PLIK_WYWOLAN_DOCKER"
PATH="$KATALOG_ATRAPY:$PATH" monitor_wyslij_mail "projekt-x" "app" "mailpit" "1025" "monitoring@psychon.local" "" "temat" "tresc"
KOD_BEZ_ADRESU=$?
LICZBA_WYWOLAN="$(grep -c . "$PLIK_WYWOLAN_DOCKER" || true)"
echo "  EXIT=$KOD_BEZ_ADRESU (oczekiwano 0), wywolan docker=$LICZBA_WYWOLAN (oczekiwano 0)"
NIEZAL_8=0
[ "$KOD_BEZ_ADRESU" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0"; NIEZAL_8=1; }
[ "$LICZBA_WYWOLAN" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - docker zostal wywolany mimo braku adresu"; NIEZAL_8=1; }
if [ "$NIEZAL_8" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 8b monitor_wyslij_mail z adresem WOLA docker compose exec w PROJEKT/USLUGA podanych argumentami ==="
: > "$PLIK_WYWOLAN_DOCKER"
ATRAPA_MAIL_EXIT=0 PATH="$KATALOG_ATRAPY:$PATH" monitor_wyslij_mail "projekt-x" "app" "mailpit" "1025" "monitoring@psychon.local" "ktos@przyklad.pl" "temat" "tresc"
KOD_SUKCES=$?
echo "  EXIT=$KOD_SUKCES (oczekiwano 0)"
echo "  wywolanie atrapy docker:"
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
cat "$PLIK_WYWOLAN_DOCKER" | sed 's/^/    /'
NIEZAL_8B=0
[ "$KOD_SUKCES" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0"; NIEZAL_8B=1; }
grep -q -- "-p projekt-x " "$PLIK_WYWOLAN_DOCKER" || { echo "  WYNIK: NIEZALICZONY - PROJEKT nie trafil do wywolania"; NIEZAL_8B=1; }
grep -q -- "exec -T app " "$PLIK_WYWOLAN_DOCKER" || { echo "  WYNIK: NIEZALICZONY - USLUGA nie trafila do wywolania exec"; NIEZAL_8B=1; }
if [ "$NIEZAL_8B" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 8c monitor_wyslij_mail zwraca EXIT!=0, gdy wysylka w kontenerze zawiedzie ==="
ATRAPA_MAIL_EXIT=35 PATH="$KATALOG_ATRAPY:$PATH" monitor_wyslij_mail "projekt-x" "app" "mailpit" "1025" "monitoring@psychon.local" "ktos@przyklad.pl" "temat" "tresc"
KOD_BLAD="$?"
echo "  EXIT=$KOD_BLAD (oczekiwano != 0, konkretnie 35 - kod bledu z 'wnetrza kontenera' przekazany bez zamiany na 0)"
if [ "$KOD_BLAD" -eq 35 ]; then echo "  WYNIK: ZALICZONY"; else echo "  WYNIK: NIEZALICZONY"; NIEZALICZONE=$((NIEZALICZONE + 1)); fi
rm -f "$PLIK_WYWOLAN_DOCKER"

echo "=== 9 monitor_sprawdz_http: kod ZAWSZE 3-cyfrowy (nigdy '000000'), limit i liczba prob z argumentow ==="
cat > "$KATALOG_ATRAPY/curl" <<'EOF_CURL_NIEDOSTEPNY'
#!/usr/bin/env bash
# symuluje brak polaczenia jak prawdziwy curl: pisze "000" na stdout (przez -w)
# I konczy sie kodem != 0 - dawny blad (monitorowanie.sh sprzed poprawki) na
# takim przebiegu doklejal DRUGIE "000" przez `|| echo "000"`, dajac "000000".
printf '000'
exit 7
EOF_CURL_NIEDOSTEPNY
chmod +x "$KATALOG_ATRAPY/curl"
KOD_NIEDOSTEPNY="$(PATH="$KATALOG_ATRAPY:$PATH" monitor_sprawdz_http "http://przyklad.test/" 1 2)"
echo "  monitor_sprawdz_http (serwer nieosiagalny): '$KOD_NIEDOSTEPNY' (oczekiwano dokladnie '000', dlugosc 3)"
NIEZAL_9=0
[ "$KOD_NIEDOSTEPNY" = "000" ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano '000'"; NIEZAL_9=1; }
[ "${#KOD_NIEDOSTEPNY}" -eq 3 ] || { echo "  WYNIK: NIEZALICZONY - kod ma ${#KOD_NIEDOSTEPNY} znakow, nie 3 ('000000'?)"; NIEZAL_9=1; }
if [ "$NIEZAL_9" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 10 jedna WOLNA (4-5 s), ale poprawna odpowiedz miesci sie w limicie - kod 200, nie '000' ==="
cat > "$KATALOG_ATRAPY/curl" <<'EOF_CURL_WOLNY'
#!/usr/bin/env bash
sleep 4.5
printf '200'
exit 0
EOF_CURL_WOLNY
chmod +x "$KATALOG_ATRAPY/curl"
KOD_WOLNY="$(PATH="$KATALOG_ATRAPY:$PATH" monitor_sprawdz_http "http://przyklad.test/" 8 2)"
echo "  monitor_sprawdz_http (odpowiedz 4.5 s, limit 8 s): '$KOD_WOLNY' (oczekiwano '200', nie '000')"
if [ "$KOD_WOLNY" = "200" ]; then echo "  WYNIK: ZALICZONY"; else echo "  WYNIK: NIEZALICZONY"; NIEZALICZONE=$((NIEZALICZONE + 1)); fi

echo "=== 11 monitoring.sh calosciowo: nieudana wysylka -> EXIT!=0, 1 wiersz bledu, stan BEZ ZMIAN; nastepny bieg z poczta osiagalna -> 1 powiadomienie dostarczone ==="
KATALOG_SKRYPTU_MON="$REPO_ROOT/deploy/prod"
KATALOG_STANU_E2E="$(mktemp -d)"
KATALOG_ATRAPY_E2E="$(mktemp -d)"
PLIK_KONFIG_E2E="$(mktemp)"
PLIK_WYWOLAN_DOCKER_E2E="$(mktemp)"

cat > "$KATALOG_ATRAPY_E2E/docker" <<EOF_DOCKER_E2E
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PLIK_WYWOLAN_DOCKER_E2E"
case "\$*" in
  *"ps --status running"*) echo "app"; exit 0 ;;
  *"exec -T"*) cat > /dev/null; exit "\${ATRAPA_MAIL_EXIT:-0}" ;;
esac
exit 1
EOF_DOCKER_E2E
chmod +x "$KATALOG_ATRAPY_E2E/docker"

cat > "$KATALOG_ATRAPY_E2E/curl" <<'EOF_CURL_E2E'
#!/usr/bin/env bash
printf '200'
exit 0
EOF_CURL_E2E
chmod +x "$KATALOG_ATRAPY_E2E/curl"

cat > "$PLIK_KONFIG_E2E" <<EOF_KONFIG_E2E
PROJEKT_COMPOSE=projekt-e2e
USLUGI_MONITOROWANE=app
SCIEZKA_DYSKU=$KATALOG_ATRAPY_E2E
PROG_DYSKU_PROC=90
ADRES_KONTROLI_HTTP=http://przyklad.test/
KOD_HTTP_OCZEKIWANY=200
KATALOG_STANU=$KATALOG_STANU_E2E
HTTP_LIMIT_CZASU_S=8
HTTP_LICZBA_PROB=2
POCZTA_HOST=mailpit
POCZTA_PORT=1025
POCZTA_NADAWCA=monitoring@psychon.local
USLUGA_WYSYLKI_POCZTY=app
ADRES_ALERTOW=alert@przyklad.pl
EOF_KONFIG_E2E

cat > "$KATALOG_ATRAPY_E2E/df" <<EOF_DF_A
#!/usr/bin/env bash
echo "Filesystem     1K-blocks     Used Available Use% Mounted on"
echo "/dev/testowy    10000000  5000000    5000000  50% $KATALOG_ATRAPY_E2E"
EOF_DF_A
chmod +x "$KATALOG_ATRAPY_E2E/df"

echo "  -- bieg A (priming): dysk 50% (< prog 90%) - PIERWSZY, bez maila --"
WYJSCIE_A="$(PATH="$KATALOG_ATRAPY_E2E:$PATH" bash "$KATALOG_SKRYPTU_MON/monitoring.sh" "$PLIK_KONFIG_E2E" 2>&1)"
KOD_A=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_A" | sed 's/^/    /'
echo "  EXIT bieg A=$KOD_A (oczekiwano 0)"

cat > "$KATALOG_ATRAPY_E2E/df" <<EOF_DF_B
#!/usr/bin/env bash
echo "Filesystem     1K-blocks     Used Available Use% Mounted on"
echo "/dev/testowy    10000000  9500000     500000  95% $KATALOG_ATRAPY_E2E"
EOF_DF_B
chmod +x "$KATALOG_ATRAPY_E2E/df"

echo "  -- bieg B: dysk 95% (>= prog 90%) - ZMIANA, ale poczta NIEOSIAGALNA (atrapa docker exit=35) --"
WYJSCIE_B="$(ATRAPA_MAIL_EXIT=35 PATH="$KATALOG_ATRAPY_E2E:$PATH" bash "$KATALOG_SKRYPTU_MON/monitoring.sh" "$PLIK_KONFIG_E2E" 2>&1)"
KOD_B=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_B" | sed 's/^/    /'
LICZBA_BLEDOW_B="$(printf '%s\n' "$WYJSCIE_B" | grep -c 'BLAD wysylki powiadomienia')"
STAN_DYSK_PO_B="$(monitor_stan_odczytaj "$KATALOG_STANU_E2E" "dysk")"
echo "  EXIT bieg B=$KOD_B (oczekiwano != 0), wierszy bledu='$LICZBA_BLEDOW_B' (oczekiwano 1), stan dysku po B='$STAN_DYSK_PO_B' (oczekiwano 'ok' - BEZ ZMIAN, nie 'przekroczony')"
NIEZAL_11=0
[ "$KOD_B" -ne 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT!=0"; NIEZAL_11=1; }
[ "$LICZBA_BLEDOW_B" -eq 1 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano dokladnie 1 wiersz bledu wysylki"; NIEZAL_11=1; }
[ "$STAN_DYSK_PO_B" = "ok" ] || { echo "  WYNIK: NIEZALICZONY - stan dysku zostal zapisany mimo nieudanej wysylki"; NIEZAL_11=1; }

echo "  -- bieg C: ten sam stan (95%), poczta OSIAGALNA (atrapa docker exit=0) - powiadomienie ma zostac DOSTARCZONE --"
WYJSCIE_C="$(ATRAPA_MAIL_EXIT=0 PATH="$KATALOG_ATRAPY_E2E:$PATH" bash "$KATALOG_SKRYPTU_MON/monitoring.sh" "$PLIK_KONFIG_E2E" 2>&1)"
KOD_C=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_C" | sed 's/^/    /'
STAN_DYSK_PO_C="$(monitor_stan_odczytaj "$KATALOG_STANU_E2E" "dysk")"
echo "  EXIT bieg C=$KOD_C (oczekiwano 0), stan dysku po C='$STAN_DYSK_PO_C' (oczekiwano 'przekroczony' - zapisany PO udanej wysylce)"
printf '%s\n' "$WYJSCIE_C" | grep -q 'nowych powiadomien: 1' || { echo "  WYNIK: NIEZALICZONY - oczekiwano dokladnie 1 nowe powiadomienie w podsumowaniu biegu C"; NIEZAL_11=1; }
[ "$KOD_C" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0 w biegu C"; NIEZAL_11=1; }
[ "$STAN_DYSK_PO_C" = "przekroczony" ] || { echo "  WYNIK: NIEZALICZONY - stan dysku nie zostal zapisany po udanej wysylce"; NIEZAL_11=1; }

if [ "$NIEZAL_11" -eq 1 ]; then echo "  WYNIK: NIEZALICZONY"; NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
rm -rf "$KATALOG_STANU_E2E" "$KATALOG_ATRAPY_E2E"; rm -f "$PLIK_KONFIG_E2E" "$PLIK_WYWOLAN_DOCKER_E2E"

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
