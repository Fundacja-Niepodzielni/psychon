// Swiadek: fragment wziety doslownie z historii repo (nie parafraza), do
// probki regresji "jedyne odwolanie" (ksztalt B).
// Stan dzisiejszy, do zapisania wprost: ten przyrząd NIE MA dziś żadnego
// automatycznego wołającego. Jedyne odwołanie do niego w repo to
// `frontend/package.json` → skrypt npm `pomiar:kontrast-statusow`
// (`node scripts/pomiar-marginesu-kontrastu.mjs`) — żaden CI, żaden hook,
// żaden inny skrypt nie uruchamia go sam z siebie, więc jego kody sterowane
// {0,2,3} nie są dziś przez nic automatycznie czytane. Ten bieg NIE dodaje
