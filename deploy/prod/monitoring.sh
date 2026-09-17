#!/usr/bin/env bash
# Monitoring uruchamiany co 5 minut: stan kontenerow projektu, zajetosc
# dysku (prog z konfiguracji) i odpowiedz aplikacji pod adresem z
# konfiguracji. Trasa dedykowana zdrowiu API dzis nie istnieje w kodzie -
# ADRES_KONTROLI_HTTP wskazuje to, co odpowiada zamiast niej (patrz
# kopie.env.example). Powiadomienie mailem idzie WYLACZNIE przy ZMIANIE
# stanu (deploy/prod/lib/monitorowanie.sh: monitor_ocen_zmiane) - nie co
# uruchomienie.
#
# Stan sie zapisuje TYLKO gdy nie trzeba bylo nikogo powiadomic, ALBO gdy
# powiadomienie zostalo faktycznie dostarczone. Gdy wysylka maila zawiedzie
# (np. serwer poczty nieosiagalny), stan NIE jest zapisywany - nastepne
# uruchomienie zobaczy TA SAMA zmiane i ponowi TO SAMO powiadomienie zamiast
# je zgubic w ciszy. Kazda taka nieudana wysylka konczy caly bieg kodem != 0
# i jednym wierszem bledu w logu (stdout/stderr tego skryptu).
#
# Uzycie: monitoring.sh [PLIK_KONFIGURACJI]
set -euo pipefail

KATALOG_SKRYPTU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$KATALOG_SKRYPTU/lib/wspolne.sh"
# shellcheck source=deploy/prod/lib/monitorowanie.sh
source "$KATALOG_SKRYPTU/lib/monitorowanie.sh"

PLIK_KONFIG="${1:-$KATALOG_SKRYPTU/kopie.env}"
kopie_wczytaj_konfiguracje "$PLIK_KONFIG"
kopie_wymagaj_zmienne PROJEKT_COMPOSE USLUGI_MONITOROWANE SCIEZKA_DYSKU \
  PROG_DYSKU_PROC ADRES_KONTROLI_HTTP KOD_HTTP_OCZEKIWANY KATALOG_STANU \
  HTTP_LIMIT_CZASU_S HTTP_LICZBA_PROB POCZTA_HOST POCZTA_PORT POCZTA_NADAWCA \
  USLUGA_WYSYLKI_POCZTY

NOWYCH_POWIADOMIEN=0
BLEDOW_WYSYLKI=0

# monitor_powiadom KLUCZ STAN TEMAT TRESC
#
# Wspolny krok "powiadom o zmianie stanu, a stan zapisz tylko po sukcesie" -
# uzywany przez wszystkie trzy sekcje ponizej, zeby logika bledu byla w
# JEDNYM miejscu, nie powielona trzykrotnie z ryzykiem rozjazdu.
monitor_powiadom() {
  local klucz="$1" stan="$2" temat="$3" tresc="$4"
  if monitor_wyslij_mail "$PROJEKT_COMPOSE" "$USLUGA_WYSYLKI_POCZTY" "$POCZTA_HOST" \
      "$POCZTA_PORT" "$POCZTA_NADAWCA" "${ADRES_ALERTOW:-}" "$temat" "$tresc"; then
    monitor_stan_zapisz "$KATALOG_STANU" "$klucz" "$stan"
    NOWYCH_POWIADOMIEN=$((NOWYCH_POWIADOMIEN + 1))
  else
    echo "monitoring: BLAD wysylki powiadomienia dla '$klucz' (temat: $temat) - stan NIE zapisany, ponowie przy nastepnym uruchomieniu" >&2
    BLEDOW_WYSYLKI=$((BLEDOW_WYSYLKI + 1))
  fi
}

# --- 1. kontenery projektu ---------------------------------------------------
for USLUGA in $USLUGI_MONITOROWANE; do
  STAN="$(monitor_sprawdz_kontener "$PROJEKT_COMPOSE" "$USLUGA")"
  OCENA="$(monitor_ocen_zmiane "$KATALOG_STANU" "kontener_${USLUGA}" "$STAN")"
  echo "monitoring: kontener $USLUGA = $STAN ($OCENA)"
  if [ "$OCENA" = "ZMIANA" ]; then
    if [ "$STAN" = "dziala" ]; then
      TEMAT="PsychON: usluga $USLUGA wrocila"
    else
      TEMAT="PsychON: usluga $USLUGA niedostepna"
    fi
    monitor_powiadom "kontener_${USLUGA}" "$STAN" "$TEMAT" "Kontener uslugi $USLUGA zmienil stan na: $STAN."
  else
    monitor_stan_zapisz "$KATALOG_STANU" "kontener_${USLUGA}" "$STAN"
  fi
done

# --- 2. zajetosc dysku --------------------------------------------------------
if PROCENT_DYSKU="$(monitor_sprawdz_dysk "$SCIEZKA_DYSKU")"; then
  if [ "$PROCENT_DYSKU" -ge "$PROG_DYSKU_PROC" ]; then
    STAN_DYSKU="przekroczony"
  else
    STAN_DYSKU="ok"
  fi
  OCENA="$(monitor_ocen_zmiane "$KATALOG_STANU" "dysk" "$STAN_DYSKU")"
  echo "monitoring: dysk $SCIEZKA_DYSKU = ${PROCENT_DYSKU}% (prog ${PROG_DYSKU_PROC}%, stan $STAN_DYSKU, $OCENA)"
  if [ "$OCENA" = "ZMIANA" ]; then
    if [ "$STAN_DYSKU" = "przekroczony" ]; then
      TEMAT="PsychON: przekroczony prog zajetosci dysku"
    else
      TEMAT="PsychON: zajetosc dysku wrocila ponizej progu"
    fi
    monitor_powiadom "dysk" "$STAN_DYSKU" "$TEMAT" "Zajetosc dysku na $SCIEZKA_DYSKU: ${PROCENT_DYSKU}% (prog ${PROG_DYSKU_PROC}%)."
  else
    monitor_stan_zapisz "$KATALOG_STANU" "dysk" "$STAN_DYSKU"
  fi
else
  echo "monitoring: NIE UDALO SIE zmierzyc zajetosci dysku dla $SCIEZKA_DYSKU" >&2
fi

# --- 3. odpowiedz aplikacji ---------------------------------------------------
KOD_HTTP="$(monitor_sprawdz_http "$ADRES_KONTROLI_HTTP" "$HTTP_LIMIT_CZASU_S" "$HTTP_LICZBA_PROB")"
if [ "$KOD_HTTP" = "$KOD_HTTP_OCZEKIWANY" ]; then
  STAN_HTTP="ok"
else
  STAN_HTTP="blad_${KOD_HTTP}"
fi
OCENA="$(monitor_ocen_zmiane "$KATALOG_STANU" "http" "$STAN_HTTP")"
echo "monitoring: http $ADRES_KONTROLI_HTTP = kod $KOD_HTTP (oczekiwano $KOD_HTTP_OCZEKIWANY, stan $STAN_HTTP, $OCENA)"
if [ "$OCENA" = "ZMIANA" ]; then
  if [ "$STAN_HTTP" = "ok" ]; then
    TEMAT="PsychON: odpowiedz aplikacji wrocila do normy"
  else
    TEMAT="PsychON: aplikacja nie odpowiada poprawnie"
  fi
  monitor_powiadom "http" "$STAN_HTTP" "$TEMAT" "Adres $ADRES_KONTROLI_HTTP odpowiedzial kodem $KOD_HTTP (oczekiwano $KOD_HTTP_OCZEKIWANY)."
else
  monitor_stan_zapisz "$KATALOG_STANU" "http" "$STAN_HTTP"
fi

echo "monitoring: podsumowanie - nowych powiadomien: $NOWYCH_POWIADOMIEN, bledow wysylki: $BLEDOW_WYSYLKI"

if [ "$BLEDOW_WYSYLKI" -gt 0 ]; then
  exit 1
fi
exit 0
