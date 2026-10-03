import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZlecenieWgrania } from "@/nowy-front/lekcja-edycja/dane";
import { utworzUchwyt, type LekcjaWysylania } from "@/nowy-front/wysylanie-nagrania/uchwyt";
import { ADRES_DOSTAWCY, atrapaDostawcy, pamiecProbna } from "@/nowy-front/wysylanie-nagrania/__tests__/atrapa-dostawcy";

/**
 * Wybór trasy zlecenia wgrania w uchwycie wysyłania: lekcja z
 * `grupa: "instructor"` idzie wyłącznie zleceniem prowadzącego, lekcja bez
 * grupy — zleceniem administracji, jak dotąd. Dostawca jest atrapą.
 */

function pozwolenie(): ZlecenieWgrania {
  return {
    video_id: ["wideo", "probne"].join("-"),
    upload_url: ADRES_DOSTAWCY,
    library_id: String(7 * 11 * 13),
    expiration_time: 1_790_000_017,
    signature: ["pod", "pis"].join("-"),
  };
}

const plik = () => new File(["0123456789"], "nagranie.mp4", { type: "video/mp4", lastModified: 1_790_000_000_000 });

function srodowisko(zProwadzacym = true) {
  const magazyn = pamiecProbna();
  const zlec = vi.fn(async () => pozwolenie());
  const zlecProwadzacego = vi.fn(async () => pozwolenie());
  const uchwyt = utworzUchwyt({
    zlec,
    ...(zProwadzacym ? { zlecProwadzacego } : {}),
    magazyn: () => magazyn,
    teraz: () => Date.UTC(2026, 9, 2, 12, 0, 0),
  });
  return { zlec, zlecProwadzacego, uchwyt };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uchwyt wysyłania — trasa zlecenia według grupy lekcji", () => {
  it("lekcja prowadzącego: zlecenie prowadzącego, administracja nietknięta", async () => {
    atrapaDostawcy();
    const { zlec, zlecProwadzacego, uchwyt } = srodowisko();
    const lekcja: LekcjaWysylania = { id: 21, tytul: "Wprowadzenie", adres: "/prowadzacy/kursy/4/lekcje/21", grupa: "instructor" };

    const wynik = await uchwyt.wyslij(plik(), lekcja, "nowe");

    expect(wynik).toEqual({ rodzaj: "wyslane" });
    expect(zlecProwadzacego).toHaveBeenCalledWith(21, "Wprowadzenie");
    expect(zlec).not.toHaveBeenCalled();
  });

  it("lekcja bez grupy: zlecenie administracji, jak dotąd", async () => {
    atrapaDostawcy();
    const { zlec, zlecProwadzacego, uchwyt } = srodowisko();
    const lekcja: LekcjaWysylania = { id: 22, tytul: "Trudny rozmówca", adres: "/admin/kursy/4/lekcje/22" };

    await uchwyt.wyslij(plik(), lekcja, "nowe");

    expect(zlec).toHaveBeenCalledWith(22, "Trudny rozmówca");
    expect(zlecProwadzacego).not.toHaveBeenCalled();
  });

  it("brak zlecenia prowadzącego: odmowa, bez cofnięcia do trasy administracji", async () => {
    const dostawca = atrapaDostawcy();
    const { zlec, uchwyt } = srodowisko(false);
    const lekcja: LekcjaWysylania = { id: 21, tytul: "Wprowadzenie", adres: "/prowadzacy/kursy/4/lekcje/21", grupa: "instructor" };

    const wynik = await uchwyt.wyslij(plik(), lekcja, "nowe");

    expect(wynik.rodzaj).toBe("odmowa");
    expect(zlec).not.toHaveBeenCalled();
    expect(dostawca.metody()).toEqual([]);
  });
});
