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
