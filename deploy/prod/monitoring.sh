#!/usr/bin/env bash
# Monitoring uruchamiany co 5 minut: stan kontenerow projektu, zajetosc
# dysku (prog z konfiguracji) i odpowiedz aplikacji pod adresem z
# konfiguracji. Trasa dedykowana zdrowiu API dzis nie istnieje w kodzie -
# ADRES_KONTROLI_HTTP wskazuje to, co odpowiada zamiast niej (patrz
# kopie.env.example). Powiadomienie mailem idzie WYLACZNIE przy ZMIANIE
# stanu (deploy/prod/lib/monitorowanie.sh: monitor_ocen_zmiane) - nie co
# uruchomienie.
#
# Uzycie: monitoring.sh [PLIK_KONFIGURACJI]
set -uo pipefail

KATALOG_SKRYPTU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$KATALOG_SKRYPTU/lib/wspolne.sh"
# shellcheck source=deploy/prod/lib/monitorowanie.sh
source "$KATALOG_SKRYPTU/lib/monitorowanie.sh"

PLIK_KONFIG="${1:-$KATALOG_SKRYPTU/kopie.env}"
kopie_wczytaj_konfiguracje "$PLIK_KONFIG"
kopie_wymagaj_zmienne PROJEKT_COMPOSE USLUGI_MONITOROWANE SCIEZKA_DYSKU \
  PROG_DYSKU_PROC ADRES_KONTROLI_HTTP KOD_HTTP_OCZEKIWANY KATALOG_STANU \
  POCZTA_HOST POCZTA_PORT POCZTA_NADAWCA

NOWYCH_POWIADOMIEN=0

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
    monitor_wyslij_mail "$POCZTA_HOST" "$POCZTA_PORT" "$POCZTA_NADAWCA" "${ADRES_ALERTOW:-}" \
      "$TEMAT" "Kontener uslugi $USLUGA zmienil stan na: $STAN."
    NOWYCH_POWIADOMIEN=$((NOWYCH_POWIADOMIEN + 1))
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
    monitor_wyslij_mail "$POCZTA_HOST" "$POCZTA_PORT" "$POCZTA_NADAWCA" "${ADRES_ALERTOW:-}" \
      "$TEMAT" "Zajetosc dysku na $SCIEZKA_DYSKU: ${PROCENT_DYSKU}% (prog ${PROG_DYSKU_PROC}%)."
    NOWYCH_POWIADOMIEN=$((NOWYCH_POWIADOMIEN + 1))
  fi
else
  echo "monitoring: NIE UDALO SIE zmierzyc zajetosci dysku dla $SCIEZKA_DYSKU" >&2
fi

# --- 3. odpowiedz aplikacji ---------------------------------------------------
KOD_HTTP="$(monitor_sprawdz_http "$ADRES_KONTROLI_HTTP")"
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
  monitor_wyslij_mail "$POCZTA_HOST" "$POCZTA_PORT" "$POCZTA_NADAWCA" "${ADRES_ALERTOW:-}" \
    "$TEMAT" "Adres $ADRES_KONTROLI_HTTP odpowiedzial kodem $KOD_HTTP (oczekiwano $KOD_HTTP_OCZEKIWANY)."
  NOWYCH_POWIADOMIEN=$((NOWYCH_POWIADOMIEN + 1))
fi

echo "monitoring: podsumowanie - nowych powiadomien: $NOWYCH_POWIADOMIEN"
exit 0
