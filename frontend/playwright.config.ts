import { defineConfig, devices } from "@playwright/test";

/**
 * Szkielet testów przeglądarkowych: axe-core wymaga
 * prawdziwej przeglądarki, żeby zmierzyć kontrast — w jsdom (vitest) nie da
 * się tego zmierzyć w ogóle. Domyślny cel to dev, ale `PW_BASE_URL` pozwala
 * odpalić to samo przeciwko innemu środowisku bez zmiany kodu.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PW_BASE_URL ?? "https://psychon-dev.niepodzielni.com",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [
    ["list"],
    ["json", { outputFile: "D:/tmp/psy/arch-pw/pw-report.json" }],
  ],
});
