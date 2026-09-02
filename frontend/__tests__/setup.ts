/**
 * Wspólne przygotowanie środowiska testów frontu.
 * `@testing-library/jest-dom` dokłada asercje na węzłach DOM; sprzątanie po
 * każdym teście zapobiega temu, żeby test widział pozostałości poprzedniego
 * (najczęstsze źródło „zielonego”, które mierzy nie ten render, co trzeba).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
