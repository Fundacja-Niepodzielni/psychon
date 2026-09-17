#!/usr/bin/env bash
# Test logiki stanu monitoringu (deploy/prod/lib/monitorowanie.sh) - CZESC BEZ
# STOSU i bez prawdziwej poczty: dedupe "jedno powiadomienie na zmiane stanu"
# (monitor_ocen_zmiane), odczyt zajetosci dysku (monitor_sprawdz_dysk, na
# atrapie `df`) i to, ze brak adresu odbiorcy NIE probuje wywolac `curl`
# (atrapa `curl`, ktora ma NIGDY nie zostac uruchomiona w tym przypadku).
# Prawdziwa wysylka przez Mailpit i prawdziwy stan kontenerow sa mierzone na
# stosie (P7 pelne, z host-slot.sh), nie tutaj.
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

echo "=== 1 pierwsze uruchomienie - PIERWSZY, bez powiadomienia ==="
WYNIK_1="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_1 (oczekiwano PIERWSZY)"
sprawdz "$WYNIK_1" "PIERWSZY"

echo "=== 2 ten sam stan drugi raz - BEZ_ZMIAN ==="
WYNIK_2="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_2 (oczekiwano BEZ_ZMIAN)"
sprawdz "$WYNIK_2" "BEZ_ZMIAN"

echo "=== 3 kontener pada (dziala -> nie_dziala) - ZMIANA ==="
WYNIK_3="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_3 (oczekiwano ZMIANA)"
sprawdz "$WYNIK_3" "ZMIANA"

echo "=== 4 drugie uruchomienie bez zmiany (dalej nie_dziala) - BEZ_ZMIAN, 0 nowych ==="
WYNIK_4="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "nie_dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_4 (oczekiwano BEZ_ZMIAN)"
sprawdz "$WYNIK_4" "BEZ_ZMIAN"

echo "=== 5 kontener wraca (nie_dziala -> dziala) - ZMIANA ('wrocilo') ==="
WYNIK_5="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_app" "dziala")"
echo "  monitor_ocen_zmiane: $WYNIK_5 (oczekiwano ZMIANA)"
sprawdz "$WYNIK_5" "ZMIANA"

echo "=== 6 klucze niezalezne - stan 'dysk' nie miesza sie ze stanem 'kontener_app' ==="
WYNIK_6="$(monitor_ocen_zmiane "$KATALOG_STANU" "dysk" "ok")"
echo "  monitor_ocen_zmiane (dysk, pierwszy raz): $WYNIK_6 (oczekiwano PIERWSZY)"
sprawdz "$WYNIK_6" "PIERWSZY"

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

echo "=== 8 monitor_wyslij_mail bez adresu odbiorcy NIE wywoluje curl ==="
PLIK_WYWOLAN_CURL="$(mktemp)"
cat > "$KATALOG_ATRAPY/curl" <<EOF_CURL
#!/usr/bin/env bash
printf 'WYWOLANO\n' >> "$PLIK_WYWOLAN_CURL"
exit 0
EOF_CURL
chmod +x "$KATALOG_ATRAPY/curl"
PATH="$KATALOG_ATRAPY:$PATH" monitor_wyslij_mail "mailpit" "1025" "monitoring@psychon.local" "" "temat" "tresc"
KOD_BEZ_ADRESU=$?
LICZBA_WYWOLAN="$(grep -c WYWOLANO "$PLIK_WYWOLAN_CURL" || true)"
echo "  EXIT=$KOD_BEZ_ADRESU (oczekiwano 0), wywolan curl=$LICZBA_WYWOLAN (oczekiwano 0)"
NIEZAL_8=0
[ "$KOD_BEZ_ADRESU" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0"; NIEZAL_8=1; }
[ "$LICZBA_WYWOLAN" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - curl zostal wywolany mimo braku adresu"; NIEZAL_8=1; }
if [ "$NIEZAL_8" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
rm -f "$PLIK_WYWOLAN_CURL"

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
