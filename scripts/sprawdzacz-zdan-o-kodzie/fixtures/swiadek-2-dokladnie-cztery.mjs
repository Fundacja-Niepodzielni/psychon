// Swiadek: fragment wziety doslownie z historii repo (nie parafraza), do
// probki regresji "dokladnie N miejsc" (ksztalt A).
// ta sama konwencja nazywania ("pomiar-*").
//
// Stan dzisiejszy, do zapisania wprost: ten przyrząd NIE MA dziś żadnego
// automatycznego wołającego. Sprawdzone poleceniem
// `grep -rn "pomiar-marginesu-kontrastu\|pomiar:kontrast-statusow" .`
// (uruchomionym z korzenia repo) — poza tym plikiem samym w sobie wychodzą
// dokładnie cztery miejsca: `frontend/package.json` (definicja aliasu npm
// `pomiar:kontrast-statusow` → `node scripts/pomiar-marginesu-kontrastu.mjs`),
// `frontend/AUDYT-DOSTEPNOSCI.md:193` (zdanie prozy odsyłające do tego
// polecenia) oraz `frontend/app/globals.css:84` i `frontend/app/globals.css:95`
// (komentarze przy tokenach `--psy-success`/`--psy-info-badge`, też prozą, nie
// kodem). Żadne z tych czterech miejsc nie jest automatycznym wołającym:
// `package.json` tylko DEFINIUJE alias, którego trzeba użyć ręcznie
