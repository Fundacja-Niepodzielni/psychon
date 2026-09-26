import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  build: {
    outDir: "../../dist-poligon",
    emptyOutDir: true,
  },
});
