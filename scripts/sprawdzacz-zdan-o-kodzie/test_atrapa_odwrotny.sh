#!/usr/bin/env bash
# Pomiar odwrotny na calej wlasnej suicie: podmienia sprawdzacz.py na
# ATRAPE, ktora zawsze twierdzi "czysto" (zero trafien, kod 0), niezaleznie
# od wejscia, i uruchamia test_sprawdzacz.sh PRZECIWKO TEJ ATRAPIE (w
# osobnej, tymczasowej kopii katalogu - zaden plik w tym repo nie jest
# nadpisywany). Jesli suita zostaje zielona rowniez na atrapie, to suita
# jest pusta (nie zalezy od realnego zachowania sprawdzacz.py) - dowod, ze
# to sie NIE dzieje, jest tresc tego skryptu, nie jego nazwa.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_KOPIA="$(mktemp -d)"
trap 'rm -rf "$TMP_KOPIA"' EXIT

cp -r "$TU"/. "$TMP_KOPIA"/

cat > "$TMP_KOPIA/sprawdzacz.py" <<'ATRAPA'
#!/usr/bin/env python3
# Atrapa wykrywacza "zawsze czysto": ignoruje wejscie, zawsze twierdzi
# zero trafien i kod 0. Uzywana WYLACZNIE przez test_atrapa_odwrotny.sh
# do pomiaru odwrotnego na calej suicie - nigdy nie jest prawdziwym
# narzedziem.
import sys
print("POMIAR: trafienia 0 / zbadano 1 komentarzy")
sys.exit(0)
ATRAPA

echo "=== Uruchamiam wlasna suite PRZECIWKO ATRAPIE 'zawsze czysto' ==="
( cd "$TMP_KOPIA" && bash test_sprawdzacz.sh )
KOD_SUITY_NA_ATRAPIE=$?
echo "KOD_REALNY suity na atrapie: ${KOD_SUITY_NA_ATRAPIE}"

if [ "${KOD_SUITY_NA_ATRAPIE}" -eq 0 ]; then
  echo "BLAD POMIARU ODWROTNEGO: suita zostala ZIELONA takze na atrapie 'zawsze czysto' - suita jest pusta, nie zalezy od realnego zachowania sprawdzacz.py" >&2
  exit 1
fi

echo "POMIAR ODWROTNY OK: suita CZERWIENIEJE na atrapie 'zawsze czysto' (kod ${KOD_SUITY_NA_ATRAPIE} != 0) - suita realnie zalezy od zachowania sprawdzacz.py, nie jest pusta"
exit 0
