import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Układ karty osoby pod zwykłym adresem `/admin/uczestniczki/<id>` (rola: opiekun
 * projektu, dane przykładowe): wszystkie sekcje czynności i dokumenty są na stronie,
 * żadna nie wychodzi poza główny obszar, nic na siebie nie nachodzi, żaden element nie
 * jest szerszy od ekranu, a strona nie przewija się w bok — przy 1280 i 390 px.
 * Zrzut całej strony powstaje tylko, gdy ustawiono `PW_ZRZUTY` (katalog docelowy).
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

async function odpowiedz(page: Page, wzorzec: string | RegExp, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

async function atrapy(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, /\/api\/v1\/admin\/users\?/, {
    data: [
      { id: 5, first_name: "Joanna", last_name: "Prowadząca", email: "joanna@demo.pl", role: "instructor", status: "active" },
      { id: 6, first_name: "Paweł", last_name: "Superwizor", email: "pawel@demo.pl", role: "instructor", status: "active" },
    ],
    meta: { current_page: 1, per_page: 100, total: 2, last_page: 1 },
  });
  await odpowiedz(page, `${API}/admin/users/17`, {
    data: {
      profile: {
        id: 17,
        first_name: "Marta",
        last_name: "Demo",
        email: "marta@demo.pl",
        role: "volunteer",
        phone: "+48 600 100 200",
        pesel: "90010112345",
        address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
        access_expires_at: "2027-02-01T00:00:00Z",
        program_completed_at: null,
        product_group: "psychon",
      },
      progress: {
        courses_done: 8,
        courses_total: 10,
        hours_accepted: "41.5",
        supervision_present: 5,
        workshop_done: false,
        path_tests_passed: 3,
        path_tests_total: 4,
      },
      documents: [
        { id: 3, type: "volunteer_agreement", number: "NP/POR/2026/003" },
        { id: 4, type: "internship_certificate", number: "NP/ZAS/2026/004" },
      ],
      recent_notifications: [
        { id: 1, type: "internship.accepted", title: "Wpis stażu został zaakceptowany", body: null, link: null, read_at: null, created_at: "2026-10-01T10:00:00Z" },
      ],
      audit_entries: [{ id: 1, action: "user.updated", actor_id: 1, created_at: "2026-10-01T09:00:00Z" }],
    },
  });
  await odpowiedz(page, `${API}/admin/reliability/17`, { data: { reliability_percent: "40", below_threshold: true } });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

const SEKCJE = ["Prowadzący superwizje", "Rola konta", "Reset limitu podejść", "Blokada konta"];

for (const [nazwa, wymiary] of [
  ["1280", { width: 1280, height: 800 }],
  ["390", { width: 390, height: 844 }],
] as const) {
  test(`karta osoby @${nazwa}: czynności i dokumenty w obrębie strony, bez nachodzenia i bez przewijania w bok`, async ({ page }) => {
    await page.setViewportSize(wymiary);
    await atrapy(page);
    await page.goto("/admin/uczestniczki/17");
    await zabezpieczeniePrzedEkranemDostepu(page);

    for (const naglowek of SEKCJE) {
      await expect(page.getByRole("heading", { name: naglowek, exact: true }), naglowek).toBeVisible();
    }
    const sekcjaRoli = page.locator("section", { has: page.getByRole("heading", { name: "Rola konta", exact: true }) });
    await expect(sekcjaRoli.getByText("Rola: Wolontariusz")).toBeVisible();
    await expect(sekcjaRoli.getByText("Rolę zmienia się w Kontach Niepodzielni.")).toBeVisible();
    await expect(sekcjaRoli.getByRole("combobox")).toHaveCount(0);
    await expect(sekcjaRoli.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zaznacz warsztat jako zaliczony" })).toBeVisible();
    await page.getByRole("button", { name: "Dokumenty (2)" }).click();
    await expect(page.getByText("Porozumienie wolontariackie")).toBeVisible();
    await expect(page.getByText("Zaświadczenie o stażu")).toBeVisible();

    const katalog = process.env.PW_ZRZUTY;
    if (katalog) {
      mkdirSync(katalog, { recursive: true });
      await page.screenshot({ path: join(katalog, `administracja--karta-osoby--${nazwa}.png`), fullPage: true });
    }

    const pomiar = await page.evaluate((sekcje) => {
      const prost = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
      };
      const main = document.querySelector("main")!;
      const m = prost(main);
      const bloki = sekcje.map((tytul) => {
        const h = Array.from(document.querySelectorAll("h2")).find((e) => (e.textContent ?? "").trim() === tytul)!;
        return { tytul, ...prost(h.closest("section")!) };
      });
      // Elementy sterujące wewnątrz bloku czynności: żaden nie wychodzi poza własną sekcję.
      const poza: string[] = [];
      for (const tytul of sekcje) {
        const h = Array.from(document.querySelectorAll("h2")).find((e) => (e.textContent ?? "").trim() === tytul)!;
        const sekcja = h.closest("section")!;
        const s = sekcja.getBoundingClientRect();
        for (const el of Array.from(sekcja.querySelectorAll<HTMLElement>("button, input, textarea, [role='combobox'], p"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.left < s.left - 1 || r.right > s.right + 1)) poza.push(`${tytul}: ${el.tagName} ${Math.round(r.left)}-${Math.round(r.right)}`);
        }
      }
      const szerszeOdEkranu = Array.from(document.querySelectorAll<HTMLElement>("main *"))
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 5)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`);
      return {
        main: m,
        bloki,
        poza,
        szerszeOdEkranu,
        przewijanieWBok: document.documentElement.scrollWidth > window.innerWidth,
        szerokoscEkranu: window.innerWidth,
      };
    }, SEKCJE);
    console.log(`POMIAR-KARTY @${nazwa} ${JSON.stringify(pomiar)}`);

    expect(pomiar.przewijanieWBok, "strona nie przewija się w bok").toBe(false);
    expect(pomiar.szerszeOdEkranu, "żaden element nie jest szerszy od ekranu").toEqual([]);
    expect(pomiar.poza, "elementy sterujące w obrębie własnej sekcji").toEqual([]);
    for (const b of pomiar.bloki) {
      expect(b.left, `${b.tytul}: nie wychodzi w lewo poza główny obszar`).toBeGreaterThanOrEqual(pomiar.main.left - 1);
      expect(b.right, `${b.tytul}: nie wychodzi w prawo poza główny obszar`).toBeLessThanOrEqual(pomiar.main.right + 1);
    }
    const poKolei = [...pomiar.bloki].sort((a, b) => a.top - b.top);
    for (let i = 1; i < poKolei.length; i++) {
      expect(poKolei[i].top, `${poKolei[i].tytul} nie nachodzi na ${poKolei[i - 1].tytul}`).toBeGreaterThanOrEqual(poKolei[i - 1].bottom - 1);
    }
  });
}
