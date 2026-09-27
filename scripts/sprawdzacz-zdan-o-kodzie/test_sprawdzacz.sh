#!/usr/bin/env bash
# Wlasna proba sprawdzacza (wersja 2 - kategoria, nie prawda).
#
# Sprawdza kazdy z pieciu ksztaltow (A-E) OSOBNO na spreparowanym pliku
# (proba odwrotna: kazdy ksztalt ma wlasny czerwony przypadek, wylaczenie
# ktoregokolwiek z nich daloby sie wykryc jako ta jedna konkretna proba
# czerwieniejaca, nie tylko jako brak czegos w jednym wspolnym wyniku),
# potem cztery SWIADKOW wziete doslownie z historii repo (nie parafraz -
# patrz fixtures/swiadek-*), potem dowod zerowych trafien na pliku, z
# ktorego cala ta kategoria zostala usunieta, potem kody wyjscia i
# mianownik pomiaru, a na koncu narzedzie na samym sobie.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TU" || exit 2

BLEDY=0

sprawdz_zle() {
  # $1 = plik, $2 = opisowa nazwa ksztaltu, $3 = wzorzec oczekiwany w wyniku
  local plik="$1" nazwa="$2" wzorzec="$3"
  python3 sprawdzacz.py --files "$plik" > /tmp/sprawdzacz-test-zle.log 2>&1
  local kod=$?
  echo "${plik} (ksztalt: ${nazwa}): KOD_REALNY=${kod}"
  if [ "${kod}" -ne 3 ]; then
    echo "BLAD: ${plik} powinien dac kod=3 (ksztalt ${nazwa}), a dal ${kod}" >&2
    sed 's/^/    /' /tmp/sprawdzacz-test-zle.log >&2
    BLEDY=$((BLEDY + 1))
    return
  fi
  if ! grep -qE "${wzorzec}" /tmp/sprawdzacz-test-zle.log; then
    echo "BLAD: brak oczekiwanego wzorca ksztaltu ${nazwa} w wyniku na ${plik}: ${wzorzec}" >&2
    sed 's/^/    /' /tmp/sprawdzacz-test-zle.log >&2
    BLEDY=$((BLEDY + 1))
  fi
}

sprawdz_czyste() {
  local plik="$1"
  python3 sprawdzacz.py --files "$plik" > /tmp/sprawdzacz-test-czyste.log 2>&1
  local kod=$?
  echo "${plik}: KOD_REALNY=${kod}"
  if [ "${kod}" -ne 0 ]; then
    echo "BLAD: ${plik} powinien dac kod=0 (zero trafien, pomiar sie odbyl), a dal ${kod}:" >&2
    sed 's/^/    /' /tmp/sprawdzacz-test-czyste.log >&2
    BLEDY=$((BLEDY + 1))
    return
  fi
  if ! grep -qE "^POMIAR: trafienia 0 / zbadano [1-9][0-9]* komentarzy$" /tmp/sprawdzacz-test-czyste.log; then
    echo "BLAD: ${plik} powinien miec mianownik > 0 (pomiar sie realnie odbyl), wynik:" >&2
    sed 's/^/    /' /tmp/sprawdzacz-test-czyste.log >&2
    BLEDY=$((BLEDY + 1))
  fi
}

echo "=== KSZTALTY (kazdy osobno, proba odwrotna) ==="
sprawdz_zle "fixtures/ksztalt-a-liczba.php" "A-liczba+rzeczownik+marker" \
  "liczy/wylicza drzewo \(liczba\+rzeczownik\+marker wylacznosci\)"
sprawdz_zle "fixtures/ksztalt-b-jedyne.php" "B-jedyne+odniesienie" \
  "wylacznosc bez zakresu do tego pliku"
sprawdz_zle "fixtures/ksztalt-c-nikt.php" "C-nikt+wolanie" \
  "twierdzenie o braku wolajacego w calym kodzie"
sprawdz_zle "fixtures/ksztalt-d-wszystkie.php" "D-wszystkie+lokalizacja" \
  "twierdzenie o pelnym pokryciu lokalizacji w drzewie"
sprawdz_zle "fixtures/ksztalt-e-ostatni.php" "E-ostatni-taki" \
  "twierdzenie 'ostatni taki' o elemencie drzewa"

echo "=== SWIADKOWIE (zdania wziete doslownie z historii, nie parafrazy) ==="
sprawdz_zle "fixtures/swiadek-1-jedyne-odwolanie.mjs" "swiadek-1-jedyne-odwolanie" \
  "wylacznosc bez zakresu do tego pliku"
sprawdz_zle "fixtures/swiadek-2-dokladnie-cztery.mjs" "swiadek-2-dokladnie-cztery" \
  "liczy/wylicza drzewo"
sprawdz_zle "fixtures/swiadek-3-string-literal.mjs" "swiadek-3-string-literal" \
  "liczy/wylicza drzewo"
sprawdz_zle "fixtures/swiadek-4-percentyle.sh" "swiadek-4-percentyle" \
  "liczy/wylicza drzewo"

echo "=== ZERO FALSZYWYCH TRAFIEN (kategoria usunieta z tego pliku w historii) ==="
sprawdz_czyste "fixtures/swiadek-drzewo-czyste-b190fd0.mjs"
sprawdz_czyste "fixtures/czysty.php"

echo "=== KODY WYJSCIA I MIANOWNIK POMIARU ==="
# Blad uzycia: --range bez ".." -> kod=2, nigdy 1.
python3 sprawdzacz.py --range "brak-separatora" > /tmp/sprawdzacz-test-uzycie.log 2>&1
KOD_UZYCIE=$?
echo "blad uzycia (--range zle): KOD_REALNY=${KOD_UZYCIE}"
if [ "${KOD_UZYCIE}" -ne 2 ]; then
  echo "BLAD: blad uzycia powinien dac kod=2, dal ${KOD_UZYCIE}" >&2
  BLEDY=$((BLEDY + 1))
fi

# Pomiar pusty: plik bez zadnego komentarza i bez stringow prozopodobnych
# -> zbadano=0 -> kod=2 (nie 0 - "nic nie zbadane" nie jest zaliczeniem).
python3 sprawdzacz.py --files "fixtures/pusty-pomiar.php" > /tmp/sprawdzacz-test-pusty.log 2>&1
KOD_PUSTY=$?
echo "pomiar pusty (fixtures/pusty-pomiar.php): KOD_REALNY=${KOD_PUSTY}"
if [ "${KOD_PUSTY}" -ne 2 ]; then
  echo "BLAD: pomiar pusty powinien dac kod=2, dal ${KOD_PUSTY}" >&2
  sed 's/^/    /' /tmp/sprawdzacz-test-pusty.log >&2
  BLEDY=$((BLEDY + 1))
fi
if ! grep -qE "^POMIAR: trafienia 0 / zbadano 0 komentarzy$" /tmp/sprawdzacz-test-pusty.log; then
  echo "BLAD: pomiar pusty powinien wypisac mianownik 0 wprost, wynik:" >&2
  sed 's/^/    /' /tmp/sprawdzacz-test-pusty.log >&2
  BLEDY=$((BLEDY + 1))
fi

# Naruszenie: kod nalezy do {2,3}, nigdy 1.
python3 sprawdzacz.py --files "fixtures/ksztalt-a-liczba.php" > /dev/null 2>&1
KOD_NARUSZENIE=$?
echo "naruszenie (fixtures/ksztalt-a-liczba.php): KOD_REALNY=${KOD_NARUSZENIE}"
if [ "${KOD_NARUSZENIE}" -eq 1 ]; then
  echo "BLAD: naruszenie NIGDY nie moze dac kod=1, dal 1" >&2
  BLEDY=$((BLEDY + 1))
fi
if [ "${KOD_NARUSZENIE}" -ne 2 ] && [ "${KOD_NARUSZENIE}" -ne 3 ]; then
  echo "BLAD: naruszenie powinno dac kod w {2,3}, dal ${KOD_NARUSZENIE}" >&2
  BLEDY=$((BLEDY + 1))
fi

echo "=== NARZEDZIE NA SAMYM SOBIE ==="
sprawdz_czyste "sprawdzacz.py"
sprawdz_czyste "test_sprawdzacz.sh"

echo "---"
if [ "${BLEDY}" -eq 0 ]; then
  echo "WLASNA PROBA: ZIELONA (5 ksztaltow + 4 swiadkow z historii czerwone; plik z usunieta kategoria i wlasne zrodlo zielone; kody wyjscia i mianownik pomiaru zgodne)"
  exit 0
else
  echo "WLASNA PROBA: CZERWONA - ${BLEDY} niespelnionych oczekiwan"
  exit 1
fi
