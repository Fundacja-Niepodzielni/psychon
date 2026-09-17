#!/usr/bin/env bash
# Wspolne funkcje monitoringu: stan kontenerow, zajetosc dysku, odpowiedz
# HTTP, zapamietywanie poprzedniego stanu (zeby powiadomienie szlo tylko przy
# ZMIANIE, nie przy kazdym uruchomieniu) i wysylka maila przez istniejacy
# serwer poczty. Zrodlowany przez monitoring.sh i przez jego testy. Sam w
# sobie nie ma efektow ubocznych przy `source`.

# monitor_stan_odczytaj KATALOG_STANU KLUCZ
#
# Wypisuje na stdout ostatnio zapisany stan dla KLUCZ, albo pusty ciag, gdy
# nigdy nie byl zapisany (pierwsze uruchomienie). Kod wyjscia zawsze 0.
monitor_stan_odczytaj() {
  local katalog="$1" klucz="$2" plik
  plik="${katalog}/${klucz}.stan"
  if [ -f "$plik" ]; then
    cat -- "$plik"
  fi
  return 0
}

# monitor_stan_zapisz KATALOG_STANU KLUCZ WARTOSC
monitor_stan_zapisz() {
  local katalog="$1" klucz="$2" wartosc="$3"
  install -d -m 0700 "$katalog" 2>/dev/null
  printf '%s' "$wartosc" > "${katalog}/${klucz}.stan"
  return 0
}

# monitor_sprawdz_kontener PROJEKT USLUGA
#
# Wypisuje "dziala" albo "nie_dziala" wedlug tego, czy USLUGA (nazwa serwisu
# compose w PROJEKT) ma kontener w stanie running. Kod wyjscia zawsze 0 -
# brak kontenera to WYNIK ("nie_dziala"), nie blad narzedzia.
monitor_sprawdz_kontener() {
  local projekt="$1" usluga="$2" dopasowanie
  dopasowanie="$(docker compose -p "$projekt" ps --status running --format '{{.Service}}' 2>/dev/null | grep -xF "$usluga" || true)"
  if [ -n "$dopasowanie" ]; then
    echo "dziala"
  else
    echo "nie_dziala"
  fi
  return 0
}

# monitor_sprawdz_dysk SCIEZKA
#
# Wypisuje na stdout zajetosc dysku w procentach (liczba calkowita, bez
# znaku %) dla partycji, na ktorej lezy SCIEZKA. Zwraca 1, gdy `df` nie da sie
# odczytac (np. sciezka nie istnieje).
monitor_sprawdz_dysk() {
  local sciezka="$1" wiersz procent
  wiersz="$(df -P "$sciezka" 2>/dev/null | tail -n1)"
  [ -n "$wiersz" ] || return 1
  procent="$(echo "$wiersz" | awk '{print $5}' | tr -d '%')"
  [[ "$procent" =~ ^[0-9]+$ ]] || return 1
  echo "$procent"
  return 0
}

# monitor_sprawdz_http URL
#
# Wypisuje na stdout kod odpowiedzi HTTP (np. "200", "000" gdy brak
# polaczenia). Kod wyjscia zawsze 0 - brak odpowiedzi jest WYNIKIEM.
monitor_sprawdz_http() {
  local url="$1"
  curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$url" 2>/dev/null || echo "000"
  return 0
}

# monitor_wyslij_mail HOST PORT NADAWCA ODBIORCA TEMAT TRESC
#
# Wysyla jeden mail przez serwer poczty (bez uwierzytelniania, jak lokalny
# serwer deweloperski/testowy) uzywajac `curl --url smtp://...`. Gdy ODBIORCA
# jest pusty (wlasciciel jeszcze nie wpisal adresu), NIE probuje wyslac -
# loguje to na stderr i zwraca 0 (brak adresu nie ma zatrzymywac monitoringu).
monitor_wyslij_mail() {
  local host="$1" port="$2" nadawca="$3" odbiorca="$4" temat="$5" tresc="$6" tmp kod
  if [ -z "$odbiorca" ]; then
    echo "monitoring: ADRES_ALERTOW nieustawiony - pomijam wyslanie (temat: $temat)" >&2
    return 0
  fi
  tmp="$(mktemp)"
  {
    printf 'From: %s\r\n' "$nadawca"
    printf 'To: %s\r\n' "$odbiorca"
    printf 'Subject: %s\r\n' "$temat"
    printf '\r\n'
    printf '%s\r\n' "$tresc"
  } > "$tmp"
  curl -s --max-time 10 --url "smtp://${host}:${port}" --mail-from "$nadawca" --mail-rcpt "$odbiorca" --upload-file "$tmp"
  kod=$?
  rm -f "$tmp"
  return "$kod"
}

# monitor_oceń_zmiane KATALOG_STANU KLUCZ STAN_BIEZACY
#
# Rdzen logiki "jedno powiadomienie na zmiane stanu": porownuje STAN_BIEZACY
# z zapamietanym poprzednim stanem dla KLUCZ. Zapisuje STAN_BIEZACY jako nowy
# stan ZAWSZE (tak przy zmianie, jak i bez niej). Wypisuje na stdout:
#   "PIERWSZY"  - brak poprzedniego stanu (pierwsze uruchomienie) - bez maila,
#   "ZMIANA"    - stan inny niz poprzedni - wolajacy MA wyslac mail,
#   "BEZ_ZMIAN" - stan taki sam jak poprzedni - zaden mail.
monitor_ocen_zmiane() {
  local katalog="$1" klucz="$2" stan_biezacy="$3" poprzedni
  poprzedni="$(monitor_stan_odczytaj "$katalog" "$klucz")"
  monitor_stan_zapisz "$katalog" "$klucz" "$stan_biezacy"
  if [ -z "$poprzedni" ]; then
    echo "PIERWSZY"
  elif [ "$poprzedni" != "$stan_biezacy" ]; then
    echo "ZMIANA"
  else
    echo "BEZ_ZMIAN"
  fi
  return 0
}
