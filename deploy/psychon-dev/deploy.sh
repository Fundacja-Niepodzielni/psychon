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
# Funkcje `_swiadek_logowania_*` nizej ocenia sciezke logowania (OD-092 p.4):
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

  # (a) F-104: dopasowanie PODCIAGIEM ("*" na koncu) przepuszczalo tez
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

  # (b) F-104: dawne dopasowanie PODCIAGIEM (`*client_id=psychon-web*`)
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

  # (e) F-104: ta sama wada co (b) - `*code_challenge_method=S256*` jest
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

  # (f) F-104: `grep -c` liczy LINIE pasujace, nie WYSTAPIENIA - dwa
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

# F-105: `docker compose --env-file "$env_file"` bierze zmienna SRODOWISKA
# PROCESU przed wartoscia z pliku - tak dziala podstawianie zmiennych compose
# i tak stos dostawal poprawny issuer, mimo pustej linii
# `AUTH_KEYCLOAK_ISSUER=` w /opt/psychon/.env: skrypt wdrozenia eksportuje te
# zmienna w powloce PRZED wywolaniem `deploy.sh`. Swiadek czytal WYLACZNIE
# plik (`_swiadek_logowania_czytaj_klucz`), wiec dostawal pusty ISS i biegl
# dalej z nim - stad ta funkcja: TA SAMA kolejnosc co compose, dla obu kluczy,
# ktore compose interpoluje (AUTH_KEYCLOAK_ISSUER i STAGING_DOMAIN).
#
# Argumenty: 1=nazwa zmiennej (np. AUTH_KEYCLOAK_ISSUER albo STAGING_DOMAIN),
# 2=plik .env. Wypisuje wartosc na stdout (NIGDY jej nie drukuje na
# ekran/log - to, jesli chce, robi wolajacy). Kod wyjscia:
#   0 - niepusta wartosc znaleziona: najpierw zmienna SRODOWISKA procesu
#       (jesli niepusta), inaczej niepusta wartosc z pliku .env.
#   1 - klucza NIE MA NIGDZIE: zmienna srodowiska nie jest ustawiona
#       (w ogole) I plik nie ma linii "NAZWA=" (`_czytaj_klucz` zwrocil 1).
#   2 - klucz GDZIES ISTNIAL (zmienna srodowiska byla ustawiona - choc pusta,
#       i/lub w pliku byla linia "NAZWA=") ale wartosc jest pusta WSZEDZIE,
#       gdzie wystapila. Kod 2 (rozny od 1) jest tu CELOWO: wolajacy ma
#       odroznic "pusta wartosc" od "brak klucza" (F-105 p.2), a nie zlac
#       obu w jedno "cos jest nie tak".
_swiadek_logowania_wartosc() {
  local nazwa="$1" plik="$2"
  local z_env="${!nazwa:-}"

  if [[ -n "$z_env" ]]; then
    printf '%s' "$z_env"
    return 0
  fi

  local z_pliku rc_pliku=0
  z_pliku="$(_swiadek_logowania_czytaj_klucz "$nazwa" "$plik")" || rc_pliku=$?

  if [[ "$rc_pliku" -eq 0 && -n "$z_pliku" ]]; then
    printf '%s' "$z_pliku"
    return 0
  fi

  # Nic niepustego nigdzie. `${!nazwa+x}` (indirect, z `+`) mowi, czy
  # zmienna o nazwie $nazwa jest USTAWIONA w ogole (choc pusta) - bez
  # bledu pod `set -u`, bo `+` nie odwoluje sie do wartosci domyslnej.
  if [[ -n "${!nazwa+ustawiona}" || "$rc_pliku" -eq 0 ]]; then
    return 2
  fi
  return 1
}

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
fi

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${PSYCHON_ENV_FILE:-/opt/psychon/.env}"
tls_dir="${PSYCHON_TLS_DIR:-/opt/psychon/tls}"
compose=(docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.psychon-dev.yml)

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

for plik in origin.crt origin.key; do
  if [[ ! -s "$tls_dir/$plik" ]]; then
    echo "BLAD: brak $tls_dir/$plik (certyfikat Cloudflare Origin CA). Przerywam bez zmian."
    exit 1
  fi
done

"${compose[@]}" config --quiet

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

echo "Migracje i cache konfiguracji..."
"${compose[@]}" exec -T app php artisan migrate --force
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
# F-105: TA SAMA kolejnosc co `docker compose --env-file` (najpierw
# srodowisko procesu, potem plik) - inaczej ten swiadek moglby probowac
# polaczyc sie pod inna domena, niz ta, ktora naprawde interpoluje compose.
domena=""
rc_domena=0
domena="$(_swiadek_logowania_wartosc "STAGING_DOMAIN" "$env_file")" || rc_domena=$?
if [[ "$rc_domena" -eq 2 ]]; then
  echo "  OSTRZEZENIE: STAGING_DOMAIN jest puste (w srodowisku i/lub w $env_file) - ponizsze proby polacza sie bez nazwy domeny."
elif [[ "$rc_domena" -ne 0 ]]; then
  echo "  OSTRZEZENIE: brak STAGING_DOMAIN (ani w srodowisku, ani w $env_file) - ponizsze proby polacza sie bez nazwy domeny."
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

# Swiadek sciezki logowania (OD-092 p.4): trasa wyzej dowodzi tylko, ze
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
# F-105: przyczyna zrodlowa tego swiadka. Skrypt wdrozenia eksportuje
# AUTH_KEYCLOAK_ISSUER w powloce PRZED wywolaniem `deploy.sh`, a
# `docker compose --env-file` bierze te zmienna PRZED wartoscia z pliku -
# stos dostaje dobry issuer, nawet gdy w /opt/psychon/.env stoi pusta linia
# `AUTH_KEYCLOAK_ISSUER=`. Swiadek MUSI patrzec na to samo zrodlo w tej samej
# kolejnosci, inaczej ocenia sciezke logowania z ISS, ktorego stos wcale nie
# uzywa (tu: pusty ISS -> `(a)` zawsze BLAD, a GET na pusty Location -> 000).
iss=""
rc_iss=0
iss="$(_swiadek_logowania_wartosc "AUTH_KEYCLOAK_ISSUER" "$env_file")" || rc_iss=$?
if [[ "$rc_iss" -eq 2 ]]; then
  # Pusta wartosc (F-105 p.2): ODROZNIONA od braku klucza w komunikacie
  # nizej. Zaden curl do IdP (ani do naszego /api/auth/csrf czy
  # /api/auth/signin/keycloak) sie tu NIE odbywa - z pustym ISS i tak nie da
  # sie ocenic (a), wiec nie ma czego mierzyc siecia.
  echo "SWIADEK LOGOWANIA: NIEZALICZONY (AUTH_KEYCLOAK_ISSUER jest puste - w srodowisku i/lub w $env_file)"
elif [[ "$rc_iss" -ne 0 ]]; then
  # Brak klucza nie przerywa wdrozenia (ta sama konwencja co reszta tego
  # swiadka): uslugi juz staly, wiec twardy `exit` tutaj tylko ukrylby, ze
  # wdrozenie sie udalo, a jedynie brakuje jednej zmiennej.
  echo "SWIADEK LOGOWANIA: NIEZALICZONY (brak klucza AUTH_KEYCLOAK_ISSUER - ani w srodowisku, ani w $env_file)"
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
