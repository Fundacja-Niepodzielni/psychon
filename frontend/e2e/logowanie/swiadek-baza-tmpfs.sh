#!/usr/bin/env bash
# Swiadek (bez Dockera, bez zywego biegu): sprawdza, czy polecenie `docker run`
# bazy e2e w podanym pliku niesie `--tmpfs /var/lib/postgresql/data`.
#
# Uzycie: swiadek-baza-tmpfs.sh <plik-uruchom.sh>
#
# Brak `--tmpfs /var/lib/postgresql/data` w bloku polecenia -> kod niezerowy
# (czerwien). Obecnosc -> kod 0 (zielono). Zadnej mutacji, zadnego kasowania -
# skrypt wylacznie czyta wskazany plik.
set -uo pipefail

PLIK="${1:?uzycie: swiadek-baza-tmpfs.sh <plik-uruchom.sh>}"

if [ ! -f "$PLIK" ]; then
    echo "[swiadek-baza-tmpfs] BRAK PLIKU: $PLIK" >&2
    exit 2
fi

# Wytnij blok polecenia docker run bazy: od linii z "docker run --rm -d"
# do linii z "postgres:17" (ten sam blok, ktory tworzy kontener psy-e2e-db-*).
BLOK="$(awk '/docker run --rm -d/{f=1} f{print} f && /postgres:17/{f=0}' "$PLIK")"

if [ -z "$BLOK" ]; then
    echo "[swiadek-baza-tmpfs] NIE ZNALEZIONO polecenia docker run bazy w $PLIK" >&2
    exit 2
fi

# Wyklucz linie komentarza (# po bialych znakach na poczatku linii) - komentarz
# opisujacy flage nie jest flaga zywa.
BLOK_BEZ_KOMENTARZY="$(printf '%s\n' "$BLOK" | grep -v -- '^[[:space:]]*#')"

# Ogranicz dopasowanie do linii samego polecenia `docker run` (pierwsza linia
# bloku, po odcieciu komentarzy, oraz jej kontynuacje laczone `\` na koncu
# linii) - inne polecenia w bloku (np. `echo`) nie licza sie jako flaga.
POLECENIE=""
W_POLECENIU=1
while IFS= read -r LINIA; do
    if [ "$W_POLECENIU" -eq 1 ]; then
        POLECENIE="${POLECENIE}${LINIA}"$'\n'
        case "$LINIA" in
            *\\) ;;
            *) W_POLECENIU=0 ;;
        esac
    fi
done <<EOF
$BLOK_BEZ_KOMENTARZY
EOF

if printf '%s' "$POLECENIE" | grep -q -- '--tmpfs /var/lib/postgresql/data'; then
    echo "[swiadek-baza-tmpfs] ZIELONO - --tmpfs /var/lib/postgresql/data obecny w poleceniu docker run w $PLIK"
    exit 0
else
    echo "[swiadek-baza-tmpfs] CZERWIEN - brak --tmpfs /var/lib/postgresql/data w poleceniu docker run w $PLIK" >&2
    exit 1
fi
