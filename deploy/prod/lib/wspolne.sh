#!/usr/bin/env bash
# Wspolne funkcje kopii zapasowych i monitoringu srodowiska produkcyjnego.
# Zrodlowany PRZEZ skrypty (kopia-nocna.sh, odtworzenie-probne.sh, monitoring.sh)
# i PRZEZ ich testy w deploy/tests/ - jedno miejsce, jedna prawda o tym, jak
# liczymy rotacje, jak czytamy konfiguracje i jak wolamy docker compose.
# Ten plik NIE ma efektow ubocznych przy `source` (definiuje wylacznie funkcje)
# i sam w sobie niczego nie uruchamia ani nie drukuje.

# kopie_log PLIK_LOG TEKST
#
# Dopisuje jeden wiersz z sygnatura czasu do PLIK_LOG (zaklada katalog kopii
# z prawami 700, jesli brakuje). Nigdy nie przyjmuje wartosci z konfiguracji
# wprost - wolajacy sklada TEKST sam, wiec to on odpowiada za to, zeby nie
# wkleic tam hasla. Kod wyjscia zawsze 0 (log, ktory sam pada, nie ma
# przerywac kopii).
kopie_log() {
  local plik_log="$1" tekst="$2" katalog
  katalog="$(dirname -- "$plik_log")"
  [ -d "$katalog" ] || install -d -m 0700 "$katalog" 2>/dev/null
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$tekst" >> "$plik_log"
  return 0
}

# kopie_wczytaj_konfiguracje PLIK_KONFIG
#
# Zrodlowuje PLIK_KONFIG (para KLUCZ=WARTOSC, jak plik .env) do biezacej
# powloki. Odmawia (kod 1, komunikat na stderr), gdy pliku nie ma - wolajacy
# ma dostac czytelny powod, a nie "unbound variable" z linii 40 skryptu.
kopie_wczytaj_konfiguracje() {
  local plik="$1"
  if [ ! -f "$plik" ]; then
    echo "kopie: brak pliku konfiguracyjnego '$plik'" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$plik"
  set +a
  return 0
}

# kopie_wymagaj_zmienne NAZWA_ZMIENNEJ [NAZWA_ZMIENNEJ ...]
#
# Sprawdza, ze kazda z podanych zmiennych srodowiskowych jest USTAWIONA I
# NIEPUSTA. Wypisuje na stderr liste brakujacych (nazwy, NIGDY wartosci -
# nawet gdy zmienna akurat niesie sekret) i zwraca 1, jesli ktorejs brakuje.
kopie_wymagaj_zmienne() {
  local brakujace="" nazwa
  for nazwa in "$@"; do
    if [ -z "${!nazwa:-}" ]; then
      brakujace="${brakujace} ${nazwa}"
    fi
  done
  if [ -n "$brakujace" ]; then
    echo "kopie: brakujace wymagane zmienne konfiguracji:${brakujace}" >&2
    return 1
  fi
  return 0
}

# kopie_rotuj KATALOG WZORZEC DNI_RETENCJI PLIK_LOG DZISIAJ
#
# W KATALOGU, wsrod plikow pasujacych do WZORCA (glob, np. "psychon-baza-*.dump"),
# usuwa te, ktorych DATA W NAZWIE (pierwsze 8 cyfr z rzedu, format YYYYMMDD) jest
# STARSZA niz DNI_RETENCJI dni liczac od DZISIAJ (YYYYMMDD) - rotacja liczy WIEK
# PLIKU, nie ich liczbe: kilka kopii tego samego dnia (np. reczne uruchomienie
# obok zadania nocnego) NIE skraca okresu przechowywania pozostalych.
#
# Plik, ktorego nazwa zawiera DZISIAJ, NIGDY nie jest usuwany - nawet gdyby
# (przez blad zegara systemowego) wyszedl poza granice. Plik, ktorego nazwa nie
# niesie rozpoznawalnej daty, NIE jest ruszany (bezpieczny domysl: nie kasujemy
# czego nie potrafimy datowac).
#
# Kazde usuniecie trafia do PLIK_LOG jako osobny wiersz. Wypisuje na stdout
# dwie liczby: "ZOSTAJE USUNIETO".
kopie_rotuj() {
  local katalog="$1" wzorzec="$2" dni_retencji="$3" plik_log="$4" dzisiaj="$5"
  local -a wszystkie=() zostaje=() usuniete=()
  local plik data_pliku granica

  granica="$(date -d "${dzisiaj} -${dni_retencji} day" '+%Y%m%d' 2>/dev/null \
    || date -j -f '%Y%m%d' -v-"${dni_retencji}"d "$dzisiaj" '+%Y%m%d' 2>/dev/null)"
  [ -n "$granica" ] || granica="$dzisiaj"

  while IFS= read -r plik; do
    [ -n "$plik" ] && wszystkie+=("$plik")
  done < <(find "$katalog" -maxdepth 1 -type f -name "$wzorzec" -printf '%f\n' 2>/dev/null | sort -r)

  for plik in "${wszystkie[@]}"; do
    if [[ "$plik" == *"$dzisiaj"* ]]; then
      zostaje+=("$plik")
      continue
    fi
    data_pliku="$(printf '%s' "$plik" | grep -oE '[0-9]{8}' | head -n1)"
    if [ -z "$data_pliku" ]; then
      zostaje+=("$plik")
    elif [ "$data_pliku" -ge "$granica" ]; then
      zostaje+=("$plik")
    else
      usuniete+=("$plik")
    fi
  done

  for plik in "${usuniete[@]}"; do
    rm -f -- "$katalog/$plik"
    kopie_log "$plik_log" "rotacja: usunieto $plik (starszy niz $dni_retencji dni, granica $granica)"
  done

  echo "${#zostaje[@]} ${#usuniete[@]}"
  return 0
}

# kopie_pg_dump PROJEKT UZYTKOWNIK BAZA PLIK_WYJSCIOWY
#
# Zrzut bazy w formacie wlasnym (skompresowany) przez `docker compose exec`
# do uslugi "pgsql" projektu PROJEKT. UZYTKOWNIK i BAZA pochodza WYLACZNIE z
# argumentow (czyli z konfiguracji wolajacego), nigdy nie sa tu wpisane na
# sztywno - to jest przedmiot pomiaru P5 (atrapa docker w deploy/tests/).
# Zapisuje NAJPIERW do PLIK_WYJSCIOWY.tmp i dopiero po sukcesie `mv`, zeby
# przerwany zrzut nigdy nie zostawil pliku, ktory wyglada na gotowa kopie.
kopie_pg_dump() {
  local projekt="$1" uzytkownik="$2" baza="$3" plik_wyjsciowy="$4"
  if ! docker compose -p "$projekt" exec -T pgsql \
      pg_dump -U "$uzytkownik" -Fc "$baza" > "${plik_wyjsciowy}.tmp"; then
    rm -f "${plik_wyjsciowy}.tmp"
    return 1
  fi
  mv "${plik_wyjsciowy}.tmp" "$plik_wyjsciowy"
  chmod 600 "$plik_wyjsciowy"
  return 0
}

# kopie_pg_policz_wiersze PROJEKT UZYTKOWNIK BAZA TABELA
#
# Wypisuje na stdout liczbe wierszy TABELA (SELECT count(*), bez cudzyslowow
# w nazwie tabeli - lista tabel pochodzi z konfiguracji zaufanej, nie od
# uzytkownika koncowego). Zwraca kod wyjscia dockera/psql.
kopie_pg_policz_wiersze() {
  local projekt="$1" uzytkownik="$2" baza="$3" tabela="$4"
  docker compose -p "$projekt" exec -T pgsql \
    psql -U "$uzytkownik" -d "$baza" -tAc "select count(*) from ${tabela}" | tr -d '[:space:]'
  return "${PIPESTATUS[0]}"
}

# kopie_archiwizuj_storage KATALOG_STORAGE PLIK_WYJSCIOWY
#
# Archiwum tar.gz katalogu KATALOG_STORAGE (bind-mount hosta, wiec bez dockera).
# Tak samo jak przy zrzucie bazy: najpierw ".tmp", potem `mv` po sukcesie.
kopie_archiwizuj_storage() {
  local katalog_storage="$1" plik_wyjsciowy="$2" rodzic baza_nazwa
  if [ ! -d "$katalog_storage" ]; then
    echo "kopie: katalog storage '$katalog_storage' nie istnieje" >&2
    return 1
  fi
  rodzic="$(dirname -- "$katalog_storage")"
  baza_nazwa="$(basename -- "$katalog_storage")"
  if ! tar -czf "${plik_wyjsciowy}.tmp" -C "$rodzic" "$baza_nazwa"; then
    rm -f "${plik_wyjsciowy}.tmp"
    return 1
  fi
  mv "${plik_wyjsciowy}.tmp" "$plik_wyjsciowy"
  chmod 600 "$plik_wyjsciowy"
  return 0
}

# kopie_cel_zewnetrzny CEL PLIK_LOG ZNACZNIK PLIK [PLIK ...]
#
# Krok WYMIENNY: gdy CEL jest pusty, POMIJA kopiowanie i zapisuje o tym
# WYRAZNY wpis w logu (nie cicho) - zwraca 0. Gdy CEL jest ustawiony (katalog
# na hoscie albo atrapa celu w testach), kopiuje kazdy PLIK do CEL i loguje
# sukces. Zwraca 1, gdy CEL jest ustawiony, ale kopiowanie ktoregos pliku
# padlo.
kopie_cel_zewnetrzny() {
  local cel="$1" plik_log="$2" znacznik="$3"
  shift 3
  if [ -z "$cel" ]; then
    kopie_log "$plik_log" "kopia $znacznik: cel poza hostem NIEUSTAWIONY - krok pominiety"
    return 0
  fi
  install -d -m 0700 "$cel" 2>/dev/null
  local plik
  for plik in "$@"; do
    if ! cp -- "$plik" "$cel/"; then
      kopie_log "$plik_log" "kopia $znacznik: BLAD kopiowania $(basename -- "$plik") do celu poza hostem $cel"
      return 1
    fi
  done
  kopie_log "$plik_log" "kopia $znacznik: skopiowano $# plik(ow) do celu poza hostem $cel"
  return 0
}

# kopie_rozmiar_pliku PLIK
#
# Rozmiar pliku w bajtach (coreutils `stat -c%s`), pusto+kod 1, gdy plik nie
# istnieje.
kopie_rozmiar_pliku() {
  stat -c%s -- "$1" 2>/dev/null
}
