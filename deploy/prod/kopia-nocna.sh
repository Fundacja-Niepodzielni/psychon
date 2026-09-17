#!/usr/bin/env bash
# Nocna kopia zapasowa: zrzut bazy (format wlasny, skompresowany) + archiwum
# katalogu storage, rotacja starych kopii i (opcjonalnie) kopiowanie poza
# hosta. Wszystkie parametry pochodza z pliku konfiguracyjnego - zaden
# uzytkownik ani nazwa bazy nie sa tu wpisane na sztywno (deploy/prod/lib/wspolne.sh
# niesie funkcje, ktore o to dbaja).
#
# Uzycie: kopia-nocna.sh [PLIK_KONFIGURACJI]
#   domyslnie: kopie.env obok tego skryptu.
set -euo pipefail

KATALOG_SKRYPTU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$KATALOG_SKRYPTU/lib/wspolne.sh"

PLIK_KONFIG="${1:-$KATALOG_SKRYPTU/kopie.env}"
kopie_wczytaj_konfiguracje "$PLIK_KONFIG"
kopie_wymagaj_zmienne PROJEKT_COMPOSE DB_UZYTKOWNIK DB_NAZWA KATALOG_KOPII \
  KATALOG_STORAGE RETENCJA_DNI TABELE_KONTROLNE

install -d -m 0700 "$KATALOG_KOPII"

ZNACZNIK="$(date '+%Y%m%d-%H%M%S')"
DZISIAJ="$(date '+%Y%m%d')"
PLIK_LOG="$KATALOG_KOPII/kopie.log"

PLIK_BAZY="$KATALOG_KOPII/psychon-baza-$ZNACZNIK.dump"
PLIK_STORAGE="$KATALOG_KOPII/psychon-storage-$ZNACZNIK.tar.gz"
PLIK_LICZB="$KATALOG_KOPII/psychon-baza-$ZNACZNIK.liczby"

# --- 1. zrzut bazy ----------------------------------------------------------
if ! kopie_pg_dump "$PROJEKT_COMPOSE" "$DB_UZYTKOWNIK" "$DB_NAZWA" "$PLIK_BAZY"; then
  kopie_log "$PLIK_LOG" "kopia $ZNACZNIK: BLAD zrzutu bazy - przerywam"
  exit 1
fi

# --- 2. liczba wierszy w tabelach kontrolnych (zapis do porownania przy odtworzeniu) ---
: > "$PLIK_LICZB"
for TABELA in $TABELE_KONTROLNE; do
  LICZBA="$(kopie_pg_policz_wiersze "$PROJEKT_COMPOSE" "$DB_UZYTKOWNIK" "$DB_NAZWA" "$TABELA")"
  printf '%s %s\n' "$TABELA" "$LICZBA" >> "$PLIK_LICZB"
  kopie_log "$PLIK_LOG" "kopia $ZNACZNIK: tabela $TABELA = $LICZBA wierszy"
done
chmod 600 "$PLIK_LICZB"

# --- 3. archiwum storage -----------------------------------------------------
# shellcheck disable=SC2153 # KATALOG_STORAGE pochodzi z pliku konfiguracyjnego (kopie_wczytaj_konfiguracje), nie jest literowka
if ! kopie_archiwizuj_storage "$KATALOG_STORAGE" "$PLIK_STORAGE"; then
  kopie_log "$PLIK_LOG" "kopia $ZNACZNIK: BLAD archiwizacji storage - przerywam"
  exit 1
fi

chmod 700 "$KATALOG_KOPII"

kopie_log "$PLIK_LOG" "kopia $ZNACZNIK: plik bazy $(basename -- "$PLIK_BAZY") ($(kopie_rozmiar_pliku "$PLIK_BAZY") B), plik storage $(basename -- "$PLIK_STORAGE") ($(kopie_rozmiar_pliku "$PLIK_STORAGE") B)"

# --- 4. rotacja ---------------------------------------------------------------
kopie_rotuj "$KATALOG_KOPII" "psychon-baza-*.dump" "$RETENCJA_DNI" "$PLIK_LOG" "$DZISIAJ" >/dev/null
kopie_rotuj "$KATALOG_KOPII" "psychon-baza-*.liczby" "$RETENCJA_DNI" "$PLIK_LOG" "$DZISIAJ" >/dev/null
kopie_rotuj "$KATALOG_KOPII" "psychon-storage-*.tar.gz" "$RETENCJA_DNI" "$PLIK_LOG" "$DZISIAJ" >/dev/null

# --- 5. kopia poza hostem (krok wymienny) -------------------------------------
kopie_cel_zewnetrzny "${CEL_ZEWNETRZNY:-}" "$PLIK_LOG" "$ZNACZNIK" "$PLIK_BAZY" "$PLIK_STORAGE"

kopie_log "$PLIK_LOG" "kopia $ZNACZNIK: zakonczona bez bledow"
exit 0
