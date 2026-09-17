#!/usr/bin/env bash
# Test harmonogramu (deploy/prod/harmonogram/psychon-crontab), P8.
#
# Metoda: CRONTAB w kontenerze testowym (nie systemd-analyze - harmonogram
# tej rundy jest cron, patrz komentarz w samym pliku harmonogramu). Kontener
# `alpine` dostaje pakiet `dcron` (busybox crond) i wolane jest na naszym
# pliku `crontab PLIK && crontab -l` - to jest PRAWDZIWY parser wyrazen cron,
# nie wlasny regex. Container jednorazowy, bez sieci po instalacji pakietu -
# nie jest to "stos" projektu i nie bierze slotu hosta.
#
# Dodatkowo (bez dockera): sprawdzenie WPROST dwoch wymaganych wyrazen czasu
# (3:00 dla kopii, co 5 min dla monitoringu) w tresci pliku harmonogramu -
# niezalezne od tego, czy parser cron je rozumie tak samo jak my.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
PLIK_HARMONOGRAMU="$REPO_ROOT/deploy/prod/harmonogram/psychon-crontab"

NIEZALICZONE=0
NIEZMIERZONE=0

echo "=== 1 plik harmonogramu istnieje ==="
if [ -f "$PLIK_HARMONOGRAMU" ]; then
  echo "  $PLIK_HARMONOGRAMU istnieje"
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY - plik nie istnieje"
  NIEZALICZONE=$((NIEZALICZONE + 1))
  echo "NIEZALICZONE=$NIEZALICZONE"
  exit 1
fi

echo "=== 2 wyrazenie czasu kopii = 0 3 * * * (3:00 codziennie) ==="
WIERSZ_KOPII="$(grep -E '^\s*0 3 \* \* \*\s' "$PLIK_HARMONOGRAMU" || true)"
if [ -n "$WIERSZ_KOPII" ]; then
  echo "  $WIERSZ_KOPII"
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY - brak wiersza '0 3 * * *' w harmonogramie"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 3 wyrazenie czasu monitoringu = */5 * * * * (co 5 minut) ==="
WIERSZ_MONITORINGU="$(grep -E '^\s*\*/5 \* \* \* \*\s' "$PLIK_HARMONOGRAMU" || true)"
if [ -n "$WIERSZ_MONITORINGU" ]; then
  echo "  $WIERSZ_MONITORINGU"
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY - brak wiersza '*/5 * * * *' w harmonogramie"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 4 kopia storage co najmniej raz w tygodniu - kopia-nocna.sh robi baze I storage w JEDNYM biegu nocnym ==="
if grep -q "kopie_archiwizuj_storage" "$REPO_ROOT/deploy/prod/kopia-nocna.sh"; then
  echo "  kopia-nocna.sh wywoluje kopie_archiwizuj_storage w tym samym biegu co zrzut bazy"
  echo "  bieg nocny (0 3 * * *) jest CODZIENNY, wiec wymog 'co najmniej raz w tygodniu' jest spelniony z naddatkiem"
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY - kopia-nocna.sh nie wywoluje archiwizacji storage"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 5 skladnia harmonogramu w kontenerze testowym (crontab) ==="
if ! command -v docker >/dev/null 2>&1; then
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  NIEZMIERZONE=$((NIEZMIERZONE + 1))
else
  # Plik harmonogramu instalujemy jako crontab UZYTKOWNIKA (bez pola "user"
  # w kazdym wierszu - to jest format /etc/cron.d, ktorego busybox crontab
  # nie rozpoznaje). Komentarze na poczatku wiersza sa dozwolone w obu
  # formatach, wiec plik uzywamy BEZ ZMIAN.
  WYJSCIE_KONTENERA="$(MSYS_NO_PATHCONV=1 docker run --rm -v "$PLIK_HARMONOGRAMU:/tmp/psychon-crontab:ro" alpine:3.20 sh -c \
    "apk add --no-cache dcron >/tmp/apk.log 2>&1; crontab /tmp/psychon-crontab 2>&1 && crontab -l" 2>&1)"
  KOD_KONTENERA=$?
  # shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
  echo "$WYJSCIE_KONTENERA" | sed 's/^/  ! /'
  echo "  EXIT kontenera=$KOD_KONTENERA"
  if [ "$KOD_KONTENERA" -eq 0 ] && printf '%s' "$WYJSCIE_KONTENERA" | grep -q '0 3 \* \* \*' && printf '%s' "$WYJSCIE_KONTENERA" | grep -q '\*/5 \* \* \* \*'; then
    echo "  WYNIK: ZALICZONY - crontab przyjal plik bez bledu skladni i obie linie sa widoczne w 'crontab -l'"
  else
    echo "  WYNIK: NIEZALICZONY - crontab odrzucil plik albo linie nie sa widoczne po instalacji"
    NIEZALICZONE=$((NIEZALICZONE + 1))
  fi
fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
echo "NIEZMIERZONE=$NIEZMIERZONE"
if [ "$NIEZALICZONE" -ne 0 ]; then
  exit 1
elif [ "$NIEZMIERZONE" -ne 0 ]; then
  exit 3
else
  exit 0
fi
