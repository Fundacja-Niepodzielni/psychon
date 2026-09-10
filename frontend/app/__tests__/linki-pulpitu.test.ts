import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Frontowa połowa kryterium ★ H19.1 — „każdy link z pulpitu → 200 we froncie".
 *
 * Kryterium przechodzi przez granicę repozytorium: serwer zwraca ścieżkę i jest
 * z siebie zadowolony, a 404 widzi dopiero osoba, która kliknie licznik. Kontrola
 * musi więc przejść tę samą granicę — ale każda z jej połówek ma mieszkać tam,
 * gdzie ma dane:
 *
 *  - **backend** (`H19/DashboardLinksTest`) dowodzi, że API zwraca DOKŁADNIE te
 *    cztery adresy i w tym kształcie;
 *  - **front** (ten plik) dowodzi, że każdy z nich ma trasę.
 *
 * Pierwsza wersja robiła obie połowy po stronie PHP i czytała `frontend/app`
 * z kontenera backendu. Działało u mnie, bo dołożyłam montowanie do własnego
 * stosu — i **pomijało się po cichu u wszystkich innych**, bo ich kontener widzi
 * tylko `./backend`. Kontrola, która działa wyłącznie na jednej maszynie, jest
 * kontrolą tej maszyny, nie systemu.
 *
 * Lista adresów jest tu STAŁĄ, nie odpytaniem API — i to jest celowe: gdyby front
 * pytał serwer, oba testy sprawdzałyby tę samą rzecz i rozjazd między nimi byłby
 * niewidoczny. Tak jak jest, zmiana adresu po stronie serwera zapala test
 * backendowy (lista się nie zgadza), a brak trasy zapala ten.
 */

/** Adresy kolejek z `GET /admin/dashboard` — te same, których pilnuje `H19/DashboardLinksTest`. */
const LINKI_KOLEJEK = [
  "/admin/uczestniczki", // applications
  "/admin/staz", // internship_entries
  "/admin/profile", // profiles
  "/prowadzacy/pytania", // questions
] as const;

/** Trasy Next.js App Routera: obecność `page.tsx` JEST definicją trasy. */
function trasyFrontu(katalog = join(process.cwd(), "app"), prefiks = ""): string[] {
  const trasy: string[] = [];

  for (const wpis of readdirSync(katalog)) {
    const sciezka = join(katalog, wpis);

    if (statSync(sciezka).isDirectory()) {
      // Grupy tras `(administracja)` porządkują pliki, ale NIE wchodzą do adresu.
      const czlon = wpis.startsWith("(") ? "" : `/${wpis}`;
      trasy.push(...trasyFrontu(sciezka, `${prefiks}${czlon}`));
      continue;
    }

    if (wpis === "page.tsx") trasy.push(prefiks === "" ? "/" : prefiks);
  }

  return trasy;
}

function trasaIstnieje(adres: string, trasy: string[]): boolean {
  return trasy.some((trasa) => {
    // Segment dynamiczny `[id]` pasuje do DOKŁADNIE jednego członu adresu.
    // Gdyby pasował do dowolnej reszty, `/admin/[x]` łapałoby wszystko i test
    // byłby zielony zawsze.
    const wzorzec = new RegExp(
      `^${trasa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\[[^\\\]]+\\\]/g, "[^/]+")}$`,
    );
    return wzorzec.test(adres);
  });
}

describe("linki kolejek pulpitu", () => {
  it("każdy prowadzi do istniejącej trasy", () => {
    const trasy = trasyFrontu();
    const donikad = LINKI_KOLEJEK.filter((link) => !trasaIstnieje(link, trasy));

    expect(
      donikad,
      `Linki prowadzące donikąd: ${donikad.join(", ")}. Znane trasy: ${trasy.sort().join(", ")}`,
    ).toEqual([]);
  });

  it("KONTROLA NEGATYWNA: spis tras odrzuca adres, którego nie ma", () => {
    // Bez tego test wyżej byłby zielony także wtedy, gdyby dopasowanie
    // przepuszczało wszystko — czyli wtedy, gdy nie mierzy nic.
    const trasy = trasyFrontu();

    expect(trasaIstnieje("/admin/nie-ma-takiej-strony", trasy)).toBe(false);
    expect(trasaIstnieje("/admin/staz", trasy)).toBe(true);
  });

  it("spis tras nie jest pusty", () => {
    // Zero linków donikąd przy zerze znanych tras to nie jest pomiar.
    expect(trasyFrontu().length).toBeGreaterThan(20);
  });

  it("segment dynamiczny nie pochłania całej reszty adresu", () => {
    // `/admin/kursy/[id]` ma łapać `/admin/kursy/7`, ale NIE `/admin/kursy/7/lekcje`.
    const trasy = ["/admin/kursy/[id]"];

    expect(trasaIstnieje("/admin/kursy/7", trasy)).toBe(true);
    expect(trasaIstnieje("/admin/kursy/7/lekcje", trasy)).toBe(false);
  });
});
