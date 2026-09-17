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
  # `|| true`: katalog moze juz istniec (typowy przypadek - kazde kolejne
  # uruchomienie) - proba zmiany uprawnien istniejacego katalogu na niektorych
  # systemach plikow konczy sie bledem mimo ze katalog jest calkiem uzywalny;
  # to NIE MA prawa ubic monitoringu pod `set -e`.
  install -d -m 0700 "$katalog" 2>/dev/null || true
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

# monitor_sprawdz_http URL LIMIT_CZASU_S LICZBA_PROB
#
# Wypisuje na stdout kod odpowiedzi HTTP - ZAWSZE dokladnie 3 cyfry ("200",
# "404", "000" gdy brak polaczenia w zadnej probie). LIMIT_CZASU_S i
# LICZBA_PROB pochodza z konfiguracji (zmienne, nie stale): jedna wolna, ale
# poprawna odpowiedz (np. 4-5 s) MA zmiescic sie w limicie i nie liczyc sie
# jako niedostepnosc; kolejne proby lapia pojedyncze, przejsciowe zacinajece
# sie polaczenie, zeby jeden zgubiony pakiet nie wywolywal powiadomienia.
# Kod wyjscia zawsze 0 - brak odpowiedzi jest WYNIKIEM, nie bledem narzedzia.
monitor_sprawdz_http() {
  local url="$1" limit_s="$2" liczba_prob="$3" proba kod="000"
  for (( proba = 1; proba <= liczba_prob; proba++ )); do
    kod="$(curl -s -o /dev/null --max-time "$limit_s" -w '%{http_code}' "$url" 2>/dev/null)"
    if [[ "$kod" =~ ^[0-9]{3}$ ]]; then
      break
    fi
    kod="000"
  done
  echo "$kod"
  return 0
}

# monitor_wyslij_mail PROJEKT USLUGA HOST PORT NADAWCA ODBIORCA TEMAT TRESC
#
# Wysyla jeden mail przez istniejacy serwer poczty. Port SMTP serwera poczty
# NIE jest opublikowany na hoscie (tylko panel podgladu jest) - polaczenie SMTP
# idzie wiec NIE z hosta, tylko z WNETRZA sieci compose: polecenie `curl`
# uruchamia sie przez `docker compose exec` w kontenerze USLUGA (nalezacym do
# tego samego projektu, wiec do tej samej sieci co serwer poczty), gdzie HOST
# rozwiazuje sie jako nazwa uslugi compose.
#
# Gdy ODBIORCA jest pusty (wlasciciel jeszcze nie wpisal adresu), NIE probuje
# wyslac - loguje to na stderr i zwraca 0 (brak adresu nie ma zatrzymywac
# monitoringu). Kazdy inny przypadek zwraca kod wyjscia `curl` z WNETRZA
# kontenera BEZ ZAMIANY na 0 - nieudana wysylka MA wrocic jako blad, zeby
# wolajacy NIE zapisal nowego stanu i ponowil probe przy nastepnym uruchomieniu.
monitor_wyslij_mail() {
  local projekt="$1" usluga="$2" host="$3" port="$4" nadawca="$5" odbiorca="$6" temat="$7" tresc="$8"
  local tmp kod
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
  docker compose -p "$projekt" exec -T "$usluga" sh -c \
    'cat > /tmp/psychon-monitoring-mail.eml && curl -s --max-time 10 --url "smtp://$1:$2" --mail-from "$3" --mail-rcpt "$4" --upload-file /tmp/psychon-monitoring-mail.eml; kod=$?; rm -f /tmp/psychon-monitoring-mail.eml; exit "$kod"' \
    sh "$host" "$port" "$nadawca" "$odbiorca" \
    < "$tmp"
  kod=$?
  rm -f "$tmp"
  return "$kod"
}

# monitor_ocen_zmiane KATALOG_STANU KLUCZ STAN_BIEZACY
#
# Rdzen logiki "jedno powiadomienie na zmiane stanu": TYLKO PORONUJE (nigdy
# nie zapisuje) STAN_BIEZACY z zapamietanym poprzednim stanem dla KLUCZ. Zapis
# nowego stanu robi WOLAJACY, osobnym wywolaniem monitor_stan_zapisz - i to
# CELOWO: przy powiadomieniu, ktore trzeba wyslac mailem, wolajacy MA zapisac
# nowy stan DOPIERO gdy wysylka sie powiodla; przy nieudanej wysylce stan ma
# zostac dawny, zeby nastepne uruchomienie ponowilo TO SAMO powiadomienie
# zamiast je zgubic. Wypisuje na stdout:
#   "PIERWSZY"  - brak poprzedniego stanu (pierwsze uruchomienie) - bez maila,
#   "ZMIANA"    - stan inny niz poprzedni - wolajacy MA wyslac mail,
#   "BEZ_ZMIAN" - stan taki sam jak poprzedni - zaden mail.
monitor_ocen_zmiane() {
  local katalog="$1" klucz="$2" stan_biezacy="$3" poprzedni
  poprzedni="$(monitor_stan_odczytaj "$katalog" "$klucz")"
  if [ -z "$poprzedni" ]; then
    echo "PIERWSZY"
  elif [ "$poprzedni" != "$stan_biezacy" ]; then
    echo "ZMIANA"
  else
    echo "BEZ_ZMIAN"
  fi
  return 0
}
