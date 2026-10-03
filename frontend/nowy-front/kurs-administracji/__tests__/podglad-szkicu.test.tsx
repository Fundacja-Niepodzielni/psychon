import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { adresPodgladu, PrzyciskiPublikacji } from "../KolumnaBoczna";
import { KURS } from "./atrapa-serwera";

/**
 * „Podgląd jako uczestnik” w szkicu kursu. Tryb podglądu istnieje: ekran
 * kursu uczestnika pod `adresPodgladu` z rolą personelu pokazuje pas podglądu,
 * a zaplecze wydaje personelowi szkic adresem kursu (kontrakt, aneks „podgląd
 * kursu nieopublikowanego”; `CourseController.php` — `canPreviewDraft`).
 * W szkicu odnośnik stoi pod zielonym „Opublikuj kurs”, z obrysem, bez tła —
 * zielony zostaje jeden. Po publikacji sam podgląd jest przyciskiem głównym.
 */

const SZKIC = { ...KURS, is_published: false };
const OPUBLIKOWANY = { ...KURS, is_published: true };

function sterowanie(kontener: HTMLElement): { rola: string; nazwa: string; klasa: string; href: string | null }[] {
  return Array.from(kontener.querySelectorAll("a, button")).map((element) => ({
    rola: element.tagName === "A" ? "link" : "button",
    nazwa: element.textContent ?? "",
    klasa: element.className,
    href: element.getAttribute("href"),
  }));
}

describe("kurs administracji — „Podgląd jako uczestnik” w szkicu", () => {
  it("szkic: pod zielonym „Opublikuj kurs” stoi odnośnik podglądu z obrysem, przed „Zapisz szkic i wyjdź”", () => {
    const { container } = render(
      <PrzyciskiPublikacji kurs={SZKIC} onOpublikuj={vi.fn()} onZapiszIWyjdz={vi.fn()} />,
    );
    const elementy = sterowanie(container);
    expect(elementy.map(({ rola, nazwa }) => `${rola}:${nazwa}`)).toEqual([
      "button:Opublikuj kurs",
      "link:Podgląd jako uczestnik",
      "button:Zapisz szkic i wyjdź",
    ]);
    const podglad = screen.getByRole("link", { name: "Podgląd jako uczestnik" });
    expect(podglad).toHaveAttribute("href", adresPodgladu(SZKIC));
    expect(podglad.className).toMatch(/przyciskPodgladu/);
    expect(podglad.className).not.toMatch(/przyciskGlowny/);
    expect(elementy.filter(({ klasa }) => /primary|przyciskGlowny/.test(klasa))).toHaveLength(1);
  });

  it("kontrola dodatnia: po publikacji podgląd jest jedynym, zielonym przyciskiem", () => {
    const { container } = render(<PrzyciskiPublikacji kurs={OPUBLIKOWANY} onOpublikuj={vi.fn()} />);
    const elementy = sterowanie(container);
    expect(elementy.map(({ rola, nazwa }) => `${rola}:${nazwa}`)).toEqual(["link:Podgląd jako uczestnik"]);
    expect(elementy[0].klasa).toMatch(/przyciskGlowny/);
    expect(elementy[0].href).toBe(adresPodgladu(OPUBLIKOWANY));
  });
});
