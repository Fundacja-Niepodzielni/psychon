#!/usr/bin/env bash
# Pomiar KC-1…KC-4 (plan B9, wariant C2 atomic design).
#
# Uruchom z dowolnego katalogu — skrypt sam przechodzi do `frontend/` (rodzic
# `scripts/`). Dla każdego kryterium drukuje DWA wiersze:
#   - "oryginał"            — polecenie w dosłownym brzmieniu z C2 (bez zmian,
#                              nawet jeśli teraz mierzy też pliki, które SĄ
#                              wzorcem, bo dokument tego nie przewidywał),
#   - "bez testów i wzorców" — to samo pytanie z wyłączeniem `__tests__`,
#                              `*.test.*` i plików kanonicznych samego wzorca
#                              (`lib/hooks/useZasob*.ts`, `components/templates/*`,
#                              `components/molecules/*`) — te NIE są powieleniem,
#                              są jego jedynym wcieleniem, więc liczenie ich jako
#                              "wzorzec, który wciąż tu jest" zawyżałoby "po".
#
# Żaden oryginalny pomiar nie jest tu zastępowany — oba wiersze zawsze idą razem.

# Bez `pipefail`: `grep | wc -l` musi móc zwrócić poprawne „0" nawet gdy
# `grep` samo w sobie kończy się kodem 1 (brak dopasowań) — to jest wynik,
# nie błąd skryptu.
set -eu
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Jeśli ten plik zostanie skopiowany poza `frontend/scripts/` (albo
# uruchomiony z drzewa, w którym `frontend/` nie jest rodzicem `scripts/`),
# powyższe `cd` wyląduje w katalogu bez `app/`, `components/`, `lib/`. Bez tej
# straży `grep`/`find` po prostu nie znajdują nic, a bez `pipefail` (patrz
# komentarz wyżej) `grep | wc -l` i tak zwraca „0" z kodem 0 — skrypt milczący
# fałszywy pozytyw. Zamiast tego jawny błąd i rc≠0.
if [ ! -d app ] || [ ! -d components ] || [ ! -d lib ]; then
  echo "Błąd: $(pwd) nie wygląda na katalog frontend/ (brak app/, components/ lub lib/)." >&2
  echo "Uruchom skrypt z jego oryginalnego miejsca w drzewie (frontend/scripts/pomiar-kc.sh), nie z kopii." >&2
  exit 1
fi

EXCL_TESTY=(--exclude-dir=__tests__ --exclude='*.test.*')
EXCL_WZORCE=(--exclude-dir=templates --exclude-dir=molecules)

echo "=== KC-1 — żaden page.tsx nie odtwarza nagłówka klasami ==="
echo '$ grep -rn "text-h[12] font-black" app --include=page.tsx | wc -l'
kc1_oryg=$(grep -rn "text-h[12] font-black" app --include=page.tsx | wc -l)
kc1_bez=$(grep -rn "text-h[12] font-black" app --include=page.tsx "${EXCL_TESTY[@]}" | wc -l)
echo "oryginał:             ${kc1_oryg}"
echo "bez testów i wzorców: ${kc1_bez}"
echo

echo "=== KC-2 — każda trasa używa szablonu ==="
echo '$ grep -rl "components/templates/" app --include=page.tsx | wc -l   (wobec find app -name page.tsx | wc -l)'
kc2_uzywa_oryg=$(grep -rl "components/templates/" app --include=page.tsx | wc -l)
kc2_razem_oryg=$(find app -name page.tsx | wc -l)
kc2_uzywa_bez=$(grep -rl "components/templates/" app --include=page.tsx "${EXCL_TESTY[@]}" | wc -l)
kc2_razem_bez=$(find app -name page.tsx -not -path '*/__tests__/*' | wc -l)
echo "oryginał:             ${kc2_uzywa_oryg} z ${kc2_razem_oryg}"
echo "bez testów i wzorców: ${kc2_uzywa_bez} z ${kc2_razem_bez}"
echo
echo "--- KC-2 organizmy (dodatkowy wiersz, nie zastępuje powyższych) ---"
echo '  Werdykt front-p1-59da632: literał liczy tylko import w samym page.tsx —'
echo '  trasy, które renderują szablon przez organizm (page.tsx -> komponent ->'
echo '  ListTemplate), nie mają importu we własnym page.tsx i wychodzą jako 0,'
echo '  mimo że szablon i tak jest użyty. Poniżej NIE są liczone trasy, tylko'
echo '  PLIKI *.tsx (poza __tests__) importujące szablon wprost — page.tsx LUB'
echo '  organizm importowany przez page.tsx. Jedna trasa może dać 0, 1 lub 2'
echo '  takie pliki (page.tsx + jego organizm), więc liczba nie jest liczbą tras.'
echo '$ grep -rl "components/templates/" app components --include=*.tsx | grep -v __tests__ | wc -l'
kc2_organizmy=$(grep -rl "components/templates/" app components --include=*.tsx | grep -v __tests__ | wc -l)
echo "KC-2 organizmy:       ${kc2_organizmy} plików *.tsx importujących szablon wprost (nie liczba tras)"
echo

echo "=== KC-3 — powielenie w całym drzewie frontend/ ==="
cat <<'POLECENIE'
$ A=$(grep -rnoE "[a-z][a-z-]*-\[[^]]+\]" app components --include=*.tsx | wc -l)   # klasy z wartością arbitralną
$ B=$(grep -rnoE "z-[0-9]+" app components --include=*.tsx | wc -l)                 # dosłowne warstwy z-*
$ C=$(grep -rn "CTA_CLASS" app components | wc -l)                                  # przycisk odtworzony stałą klasową
$ D=$(grep -rln "Poprzednia\|Następna" app components | wc -l)                       # implementacje stronicowania
$ echo $A $B $C $D $((A+B+C+D))
POLECENIE
A=$(grep -rnoE "[a-z][a-z-]*-\[[^]]+\]" app components --include=*.tsx | wc -l)
B=$(grep -rnoE "z-[0-9]+" app components --include=*.tsx | wc -l)
C=$(grep -rn "CTA_CLASS" app components | wc -l)
D=$(grep -rln "Poprzednia\|Następna" app components | wc -l)
kc3_oryg=$((A+B+C+D))
echo "oryginał:             A=${A} B=${B} C=${C} D=${D} suma=${kc3_oryg}"

Ab=$(grep -rnoE "[a-z][a-z-]*-\[[^]]+\]" app components --include=*.tsx "${EXCL_TESTY[@]}" "${EXCL_WZORCE[@]}" | wc -l)
Bb=$(grep -rnoE "z-[0-9]+" app components --include=*.tsx "${EXCL_TESTY[@]}" "${EXCL_WZORCE[@]}" | wc -l)
Cb=$(grep -rn "CTA_CLASS" app components "${EXCL_TESTY[@]}" "${EXCL_WZORCE[@]}" | wc -l)
Db=$(grep -rln "Poprzednia\|Następna" app components "${EXCL_TESTY[@]}" "${EXCL_WZORCE[@]}" | wc -l)
kc3_bez=$((Ab+Bb+Cb+Db))
echo "bez testów i wzorców: A=${Ab} B=${Bb} C=${Cb} D=${Db} suma=${kc3_bez}"
echo

echo "=== KC-4 — ręczny wzorzec pobrania (useEffect + loading + error) ==="
cat <<'POLECENIE'
$ for f in $(find app components lib -name "*.tsx" -o -name "*.ts" | grep -v __tests__); do
    if grep -q "useEffect" $f && grep -qi "loading" $f && grep -qi "error" $f; then echo $f; fi
  done | wc -l
POLECENIE
kc4_oryg=0
for f in $(find app components lib -name "*.tsx" -o -name "*.ts" | grep -v __tests__); do
  if grep -q "useEffect" "$f" && grep -qi "loading" "$f" && grep -qi "error" "$f"; then
    kc4_oryg=$((kc4_oryg + 1))
  fi
done
echo "oryginał:             ${kc4_oryg}"

kc4_bez=0
for f in $(find app components lib -name "*.tsx" -o -name "*.ts" \
    | grep -v __tests__ \
    | grep -v '\.test\.' \
    | grep -v '^lib/hooks/useZasob' \
    | grep -v '^components/templates/' \
    | grep -v '^components/molecules/'); do
  if grep -q "useEffect" "$f" && grep -qi "loading" "$f" && grep -qi "error" "$f"; then
    kc4_bez=$((kc4_bez + 1))
  fi
done
echo "bez testów i wzorców: ${kc4_bez}"
