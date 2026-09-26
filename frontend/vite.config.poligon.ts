import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Konfiguracja WYŁĄCZNIE do zmierzenia atomów w prawdziwej przeglądarce
 * (P-7, cel dotykowy). Nie jest częścią budowy MVP ani nowego frontu — osobny
 * plik, osobne wejście, nieużywany przez `next build` ani `vitest`.
 */
export default defineConfig({
  root: "design-system/poligon",
  plugins: [react()],
  build: {
    outDir: "../../dist-poligon",
    emptyOutDir: true,
  },
});
