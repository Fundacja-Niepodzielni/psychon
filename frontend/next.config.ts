import type { NextConfig } from "next";
import { naglowekRamek } from "./lib/konfiguracja/odtwarzacz-nagran";

const nextConfig: NextConfig = {
  /**
   * Ramki wolno osadzać wyłącznie z własnego pochodzenia, z odtwarzacza nagrań
   * i z serwisów filmu powitalnego. Nagłówek niesie tylko dyrektywę ramek —
   * pozostałe dyrektywy to osobna decyzja. Wartość powstaje w module
   * konfiguracji, tym samym, z którego odtwarzacz bierze dozwolone pochodzenie.
   */
  async headers() {
    return [{ source: "/:path*", headers: [naglowekRamek()] }];
  },
};

export default nextConfig;
