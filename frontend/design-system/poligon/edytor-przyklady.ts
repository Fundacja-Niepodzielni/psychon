// Treści przykładowe poligonu edytora treści lekcji — te same teksty czytają
// próby molekuły, żeby strona pokazowa i próby nie rozjechały się po cichu.

export const TRESC_PRZYKLADOWA = [
  "## Jak zacząć rozmowę",
  "",
  "Pierwsze minuty decydują o tym, czy rozmówca poczuje się bezpiecznie. **Zacznij od przedstawienia się** i powiedz, *ile czasu* potrwa rozmowa.",
  "",
  "### Na początek",
  "",
  "- powiedz, kim jesteś i jaka jest twoja rola",
  "- zapytaj, jak rozmówca chce, żeby się do niego zwracać",
  "- wyjaśnij, co stanie się z notatkami",
  "",
  "1. Przywitaj się.",
  "2. Zapytaj o `zgodę` na notatki.",
  "",
  "Więcej w [zasadach programu](/panel/kursy) i na [stronie fundacji](https://example.org/).\\",
  "Ten wiersz stoi po twardym łamaniu.",
].join("\n");

export const TRESC_SPOZA_PODZBIORU = [
  "Akapit do edycji.",
  "",
  '<div class="ramka"><script>window.wykonano = true</script><img src="x" onerror="window.wykonano = true"></div>',
  "",
  "| Kolumna | Druga |",
  "|---------|-------|",
  "| a       | b     |",
  "",
  "![Obraz](/obraz.png)",
  "",
  "```",
  "blok kodu",
  "```",
  "",
].join("\r\n");

const AKAPIT_DLUGI = "Zażółć gęślą jaźń — dwadzieścia tysięcy znaków to limit treści jednej lekcji. ";
export const TRESC_PONAD_LIMIT = AKAPIT_DLUGI.repeat(Math.ceil(20010 / AKAPIT_DLUGI.length)).slice(0, 20010);
