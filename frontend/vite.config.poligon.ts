import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Konfiguracja WYŁĄCZNIE do zmierzenia atomów w prawdziwej przeglądarce
 * (pomiar celów dotyku, próg 44px). Nie jest częścią budowy MVP ani nowego frontu — osobny
 * plik, osobne wejście, `vitest` go nie uruchamia. Uwaga: `next build` NIE
 * bundluje tego pliku ani `poligon/main.tsx`, ale sprawdzanie typów owszem —
 * `tsc --listFiles` wypisuje oba, bo `tsconfig.json` nie ma dla poligonu
 * wyjątku w liście `include`.
 */
export default defineConfig({
  root: "design-system/poligon",
  plugins: [react()],
  // Strona pokazowa nigdy nie osadza prawdziwego odtwarzacza nagrań: bez
  // zmiennej budowy dozwolonym pochodzeniem jest adres z domeny zastrzeżonej
  // dla prób, pod którym nic nie istnieje (ramkę podaje atrapa w próbie).
  define: {
    "process.env.NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN": JSON.stringify(
      process.env.NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN ?? "https://odtwarzacz.atrapa.test",
    ),
  },
  build: {
    outDir: "../../dist-poligon",
    emptyOutDir: true,
    // Trzy wejścia poligonu: atomy i molekuły (`index.html`), organizmy
    // kursu, wykresu i lekcji (`lekcja.html`) oraz organizmy formularzy
    // i dziennika (`formularze.html`). Bez jawnej listy budowa bierze
    // tylko `index.html` i `vite preview` nie ma pozostałych stron do pokazania.
    rollupOptions: {
      input: {
        "szablony-podzial": fileURLToPath(new URL("./design-system/poligon/szablony-podzial.html", import.meta.url)),
        index: fileURLToPath(new URL("./design-system/poligon/index.html", import.meta.url)),
        lekcja: fileURLToPath(new URL("./design-system/poligon/lekcja.html", import.meta.url)),
        formularze: fileURLToPath(new URL("./design-system/poligon/formularze.html", import.meta.url)),
        "szablony-kolumna": fileURLToPath(new URL("./design-system/poligon/szablony-kolumna.html", import.meta.url)),
        // Odtwarzacz nagrania w ramce: osobne wejście z atrapą ramki w próbie.
        odtwarzacz: fileURLToPath(new URL("./design-system/poligon/odtwarzacz.html", import.meta.url)),
        // Edytor treści lekcji: osobne wejście, bo tylko ono wciąga silnik edycji.
        edytor: fileURLToPath(new URL("./design-system/poligon/edytor.html", import.meta.url)),
      },
    },
  },
});
