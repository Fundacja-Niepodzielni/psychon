import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { COURSE_TYPE_LABELS, PRODUCT_GROUP_LABELS, type ReorderImpactRow } from "@/lib/h08/types";
import type { KursAdministracji } from "../dane";
import {
  KOLUMNY_KURSOW,
  adresKursu,
  czyBrakUprawnien,
  identyfikatorZTytulu,
  jednostkaLekcji,
  komunikatKoperty,
  kursyWSciezce,
  miejsceWSciezce,
  opisKursu,
  pozycjaZPola,
  przesun,
  wierszeKursow,
  wierszePodgladu,
} from "../logika";

/**
 * Logika ekranu „Kursy” (administracja) bez Reacta: wiersze listy, identyfikator
 * z tytułu, przesuwanie w kolejności, klasyfikacja błędów. Każda funkcja ma
 * przypadek zwykły i graniczny.
 */

function kurs(nadpisz: Partial<KursAdministracji> = {}): KursAdministracji {
  return {
    id: 5,
    title: "Wywiad psychologiczny",
    slug: "wywiad-psychologiczny",
    description: null,
    type: "course",
    product_group: "psychon",
    sequence_order: 2,
    edition_id: 1,
    is_published: true,
    lessons_count: 3,
    materials_count: 0,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...nadpisz,
  } as KursAdministracji;
}

function blad(status: number, message = "Komunikat serwera.") {
  return new ApiError({ status, code: "x", message });
}

describe("adresKursu", () => {
  it("prowadzi do dotychczasowego ekranu kursu", () => {
    expect(adresKursu(7)).toBe("/admin/kursy/7");
  });
});

describe("jednostkaLekcji", () => {
  it.each([
    [0, "lekcji"],
    [1, "lekcja"],
    [2, "lekcje"],
    [4, "lekcje"],
    [5, "lekcji"],
    [12, "lekcji"],
    [14, "lekcji"],
    [22, "lekcje"],
    [112, "lekcji"],
  ])("%i → %s", (liczba, oczekiwane) => {
    expect(jednostkaLekcji(liczba)).toBe(oczekiwane);
  });
});

describe("miejsceWSciezce i opisKursu", () => {
  it("kurs w ścieżce ma samą liczbę (znaczenie niesie nazwa kolumny), kurs bez miejsca jest poza ścieżką", () => {
    expect(miejsceWSciezce(3)).toEqual({ liczba: 3, bezJednostki: true });
    expect(miejsceWSciezce(null)).toEqual({ tekst: "poza ścieżką" });
  });

  it("opis pod nazwą: typ · grupa, etykiety ze słowników — bez miejsca w ścieżce i bez liczby lekcji", () => {
    expect(opisKursu(kurs())).toBe([COURSE_TYPE_LABELS.course, PRODUCT_GROUP_LABELS.psychon].join(" · "));
    expect(opisKursu(kurs())).not.toMatch(/ścieżce|lekcj/);
  });

  it("opis webinaru dla obu grup", () => {
    expect(opisKursu(kurs({ type: "webinar", sequence_order: null, product_group: "both", lessons_count: 1 }))).toBe(
      [COURSE_TYPE_LABELS.webinar, PRODUCT_GROUP_LABELS.both].join(" · "),
    );
  });
});

describe("KOLUMNY_KURSOW", () => {
  it("skład i kolejność kolumn: Kurs, Stan, Miejsce w ścieżce, Lekcje, akcja", () => {
    expect(KOLUMNY_KURSOW.map((kolumna) => [kolumna.nazwa, kolumna.rodzaj])).toEqual([
      ["Kurs", "tekst"],
      ["Stan", "stan"],
      ["Miejsce w ścieżce", "liczba"],
      ["Lekcje", "liczba"],
      ["Akcja", "akcja"],
    ]);
  });
});

describe("wierszeKursow", () => {
  it("opublikowany: plakietka „Opublikowany”, akcja Otwórz z pełną nazwą dla czytnika", () => {
    const [wiersz] = wierszeKursow([kurs()]);
    expect(wiersz.id).toBe("5");
    expect(wiersz.tytul).toBe("Wywiad psychologiczny");
    expect(wiersz.plakietka).toEqual({ wariant: "ok", tekst: "Opublikowany" });
    expect(wiersz.podpowiedz).toBe(opisKursu(kurs()));
    expect(wiersz.komorki).toEqual({
      miejsce: { liczba: 2, bezJednostki: true },
      lekcje: { liczba: 3, jednostka: "lekcje" },
    });
    expect(wiersz.akcja).toEqual({
      etykieta: "Otwórz",
      etykietaDostepna: "Otwórz kurs: Wywiad psychologiczny",
      href: "/admin/kursy/5",
    });
  });

  it("szkic: plakietka „Szkic”, wariant neutralny", () => {
    const [wiersz] = wierszeKursow([kurs({ is_published: false })]);
    expect(wiersz.plakietka).toEqual({ wariant: "neutral", tekst: "Szkic" });
  });

  it("kolejność wierszy jest kolejnością wejścia, pusta lista daje pustą listę", () => {
    expect(wierszeKursow([kurs({ id: 9 }), kurs({ id: 3 })]).map((w) => w.id)).toEqual(["9", "3"]);
    expect(wierszeKursow([])).toEqual([]);
  });
});

describe("identyfikatorZTytulu", () => {
  it.each([
    ["Wywiad psychologiczny", "wywiad-psychologiczny"],
    ["Zażółć gęślą jaźń", "zazolc-gesla-jazn"],
    ["  Podstawy   pomocy!  ", "podstawy-pomocy"],
    ["Kurs 2: etap_1", "kurs-2-etap_1"],
    ["Café", "cafe"],
    ["", ""],
    ["!!!", ""],
  ])("%j → %j", (tytul, oczekiwane) => {
    expect(identyfikatorZTytulu(tytul)).toBe(oczekiwane);
  });

  it("wynik ma najwyżej 255 znaków i nie kończy się myślnikiem", () => {
    const wynik = identyfikatorZTytulu(`${"a".repeat(254)} b`);
    expect(wynik.length).toBeLessThanOrEqual(255);
    expect(wynik.endsWith("-")).toBe(false);
    expect(identyfikatorZTytulu("a".repeat(300))).toHaveLength(255);
  });

  it("wynik spełnia wzorzec alpha_dash zaplecza", () => {
    expect(identyfikatorZTytulu("Łódź — „cytat” & więcej")).toMatch(/^[a-z0-9_-]*$/);
  });
});

describe("pozycjaZPola", () => {
  it("puste i białe znaki to null (poza ścieżką)", () => {
    expect(pozycjaZPola("")).toBeNull();
    expect(pozycjaZPola("   ")).toBeNull();
  });

  it("liczba całkowita to liczba, reszta idzie dosłownie do walidacji serwera", () => {
    expect(pozycjaZPola("4")).toBe(4);
    expect(pozycjaZPola(" 12 ")).toBe(12);
    expect(pozycjaZPola("0")).toBe(0);
    expect(pozycjaZPola("-1")).toBe("-1");
    expect(pozycjaZPola("2.5")).toBe("2.5");
    expect(pozycjaZPola("abc")).toBe("abc");
  });
});

describe("kursyWSciezce i przesun", () => {
  it("do zmiany kolejności trafiają tylko kursy z pozycją, w kolejności wejścia", () => {
    const wynik = kursyWSciezce([kurs({ id: 1 }), kurs({ id: 2, sequence_order: null }), kurs({ id: 3 })]);
    expect(wynik.map((k) => k.id)).toEqual([1, 3]);
  });

  it("przesunięcie w dół i w górę zamienia sąsiadów i nie zmienia wejścia", () => {
    const wejscie = ["a", "b", "c"];
    expect(przesun(wejscie, 0, 1)).toEqual(["b", "a", "c"]);
    expect(przesun(wejscie, 2, -1)).toEqual(["a", "c", "b"]);
    expect(wejscie).toEqual(["a", "b", "c"]);
  });

  it("poza zakresem zwraca tę samą tablicę", () => {
    const wejscie = ["a", "b"];
    expect(przesun(wejscie, 0, -1)).toBe(wejscie);
    expect(przesun(wejscie, 1, 1)).toBe(wejscie);
    expect(przesun(wejscie, 5, -1)).toBe(wejscie);
    expect(przesun([], 0, 1)).toEqual([]);
  });
});

describe("wierszePodgladu", () => {
  it("osoba, kurs i statusy po polsku", () => {
    const wiersz: ReorderImpactRow = {
      user_id: 17,
      first_name: "Marta",
      last_name: "Demo",
      course_id: 5,
      course_title: "Wywiad psychologiczny",
      from: "in_progress",
      to: "locked",
    };
    expect(wierszePodgladu([wiersz])).toEqual([
      {
        id: "17-5",
        wartosci: { osoba: "Marta Demo", kurs: "Wywiad psychologiczny", bylo: "W trakcie", bedzie: "Zablokowany" },
      },
    ]);
    expect(wierszePodgladu([])).toEqual([]);
  });
});

describe("klasyfikacja błędów", () => {
  it("401 i 403 to brak uprawnień, pozostałe błędy i nie-błędy API nie", () => {
    expect(czyBrakUprawnien(blad(401))).toBe(true);
    expect(czyBrakUprawnien(blad(403))).toBe(true);
    expect(czyBrakUprawnien(blad(500))).toBe(false);
    expect(czyBrakUprawnien(blad(422))).toBe(false);
    expect(czyBrakUprawnien(new Error("sieć"))).toBe(false);
    expect(czyBrakUprawnien(undefined)).toBe(false);
  });

  it("komunikat z koperty tylko dla błędu API z niepustym komunikatem", () => {
    expect(komunikatKoperty(blad(500, "Błąd serwera."))).toBe("Błąd serwera.");
    expect(komunikatKoperty(blad(500, "   "))).toBeUndefined();
    expect(komunikatKoperty(new Error("sieć"))).toBeUndefined();
  });
});
