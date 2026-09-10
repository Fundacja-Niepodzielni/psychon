import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Runner testów frontu.
 *
 * Vitest + jsdom, bez przeglądarki: środowisko Node, zero binariów do pobrania
 * na przebieg. Zgodne z Next 16 / React 19 — transformacja przez esbuild, więc
 * nie dublujemy łańcucha transpilacji Nexta ani nie wprowadzamy Babela.
 *
 * Alias `@/*` musi zgadzać się z `tsconfig.json` (paths) — inaczej testy
 * importują inaczej niż aplikacja i mierzą inny moduł niż ten, który jedzie na produkcję.
 */
export default defineConfig({
  // Wtyczka Reacta daje automatyczny runtime JSX zgodny z `jsx: "react-jsx"`
  // z `tsconfig.json` — bez niej testy komponentów padają na nieznanym `jsx`.
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Tylko nasze testy. Bez tego `node_modules` wciąga cudze pliki `*.test.*`
    // i suita rośnie o testy, których nikt tu nie pisał ani nie czyta.
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    // Puste uruchomienie ma być BŁĘDEM, nie zielonym zerem. Runner, który nic
    // nie znalazł, wygląda dokładnie tak samo jak runner, w którym wszystko przeszło.
    passWithNoTests: false,
    setupFiles: ["./__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
