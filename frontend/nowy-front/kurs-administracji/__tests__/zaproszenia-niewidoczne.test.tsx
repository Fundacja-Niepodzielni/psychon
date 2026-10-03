import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SekcjaZaproszenKursu } from "@/nowy-front/zaproszenia-kursu/ZaproszeniaKursu";
import { UstawieniaKursu, type WierszUstawien } from "../KolumnaBoczna";
import { KURS } from "./atrapa-serwera";

/**
 * Panel „Zaproszenia” w karcie „Ustawienia kursu” nie jest pokazywany, dopóki
 * zaproszenia na kurs nie wrócą po MVP. Kod panelu zostaje (sekcja i jej
 * wiersz w `KolumnaBoczna.tsx`), trasa ekranu kursu bez zmian — panel po
 * prostu się nie renderuje, także gdy stan ekranu wskazuje go jako otwarty.
 */

function ustawienia(otwarty: WierszUstawien | null) {
  return render(
    <UstawieniaKursu
      kurs={KURS}
      lekcje={[]}
      przypisania={[]}
      otwarty={otwarty}
      onOtwarty={vi.fn()}
      onKurs={vi.fn()}
      onPrzypisania={vi.fn()}
      onOgloszenie={vi.fn()}
    />,
  );
}

describe("kurs administracji — panel „Zaproszenia” niewidoczny", () => {
  it("karta ustawień ma tylko „Opis i dane kursu” i „Prowadzący”; wiersza i panelu zaproszeń nie ma", () => {
    const { container } = ustawienia(null);
    const karta = screen.getByRole("region", { name: "Ustawienia kursu" });
    const wiersze = Array.from(karta.querySelectorAll("h3 > button[aria-expanded]")).map((w) => w.id);
    expect(wiersze).toEqual(["ustawienia-dane", "ustawienia-prowadzacy"]);
    expect(container.querySelector("#ustawienia-zaproszenia")).toBeNull();
    expect(container.querySelector("[data-wiersz='zaproszenia']")).toBeNull();
    expect(screen.queryByText("Zaproszenia")).toBeNull();
  });

  it("stan „otwarty: zaproszenia” też niczego nie pokazuje", () => {
    const { container } = ustawienia("zaproszenia");
    expect(container.querySelector("#ustawienia-zaproszenia-panel")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyślij zaproszenia" })).toBeNull();
  });

  it("kontrola dodatnia: kod panelu zostaje — sekcja istnieje i ekran kursu nadal ją importuje", () => {
    expect(typeof SekcjaZaproszenKursu).toBe("function");
    const zrodlo = readFileSync(resolve(__dirname, "../KolumnaBoczna.tsx"), "utf8");
    expect(zrodlo).toContain("<SekcjaZaproszenKursu");
    expect(zrodlo).toContain('id="zaproszenia"');
  });
});
