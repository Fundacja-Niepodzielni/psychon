import type { Page } from "@playwright/test";

/**
 * Stanowisko ma obejście Cloudflare Access po IP dla tras publicznych —
 * ale gdyby obejście nie zadziałało (np. wygasło), test MUSI się wywalić z
 * czytelnym komunikatem, a nie przejść zielono na ekranie logowania
 * Cloudflare zamiast realnej strony PsychON.
 */
export async function zabezpieczeniePrzedEkranemDostepu(page: Page): Promise<void> {
  const url = page.url();
  if (url.includes("cloudflareaccess.com")) {
    throw new Error(
      `Strona przekierowała na ekran logowania Cloudflare Access (${url}) — ` +
        "obejście po IP dla tego stanowiska nie zadziałało. Test NIE mierzy realnej strony.",
    );
  }

  const tytul = await page.title();
  if (tytul.includes("Cloudflare Access")) {
    throw new Error(
      `Tytuł strony to ekran logowania Cloudflare Access ("${tytul}") — ` +
        "obejście po IP dla tego stanowiska nie zadziałało. Test NIE mierzy realnej strony.",
    );
  }
}
