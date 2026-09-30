import { describe, expect, it } from "vitest";
import type { KursSciezki, LekcjaKursu } from "../nastepny-krok";
import { kursDoWznowienia, wyliczWznowienie, type WznowienieStudenta } from "../wznow-lekcje";

function kurs(nadpisania: Partial<KursSciezki> = {}): KursSciezki {
  return {
    id: 7,
    slug: "webinar-superwizja",
    title: "Webinar o superwizji",
    sequence_order: null,
    status: "in_progress",
    progress_percent: 50,
    ...nadpisania,
  };
}

function lekcja(nadpisania: Partial<LekcjaKursu> = {}): LekcjaKursu {
  return { id: 31, title: "Pierwsza lekcja", sequence_order: 1, is_completed: false, ...nadpisania };
}

describe("wyliczWznowienie — tabela gałęzi", () => {
  const przypadki: Array<{
    nazwa: string;
    kursy: KursSciezki[];
    lekcje: LekcjaKursu[];
    oczekiwane: WznowienieStudenta;
  }> = [
    {
      nazwa: "1) kurs w toku i nieukończona lekcja → „lekcja” (pierwsza według sequence_order)",
      kursy: [kurs()],
      lekcje: [
        lekcja({ id: 33, sequence_order: 3 }),
        lekcja({ id: 31, sequence_order: 1, is_completed: true }),
        lekcja({ id: 32, sequence_order: 2 }),
      ],
      oczekiwane: { rodzaj: "lekcja", kurs: kurs(), lekcja: lekcja({ id: 32, sequence_order: 2 }) },
    },
    {
      nazwa: "2) kurs w toku, wszystkie lekcje ukończone → „kurs”",
      kursy: [kurs()],
      lekcje: [lekcja({ is_completed: true })],
      oczekiwane: { rodzaj: "kurs", kurs: kurs() },
    },
    {
      nazwa: "3) wszystkie kursy ukończone → „wszystko-ukonczone”",
      kursy: [kurs({ status: "completed" }), kurs({ id: 8, status: "completed" })],
      lekcje: [],
      oczekiwane: { rodzaj: "wszystko-ukonczone" },
    },
    {
      nazwa: "4) brak kursów → „brak”",
      kursy: [],
      lekcje: [],
      oczekiwane: { rodzaj: "brak" },
    },
    {
      nazwa: "5) pierwszy w toku wygrywa z późniejszym w toku i z ukończonym",
      kursy: [kurs({ id: 1, status: "completed" }), kurs({ id: 2, slug: "drugi" }), kurs({ id: 3, slug: "trzeci" })],
      lekcje: [lekcja({ id: 40 })],
      oczekiwane: { rodzaj: "lekcja", kurs: kurs({ id: 2, slug: "drugi" }), lekcja: lekcja({ id: 40 }) },
    },
  ];

  it.each(przypadki)("$nazwa", ({ kursy, lekcje, oczekiwane }) => {
    expect(wyliczWznowienie(kursy, lekcje)).toEqual(oczekiwane);
  });

  it("kontrola dodatnia: ukończenie ostatniej lekcji zamienia „lekcja” na „kurs”", () => {
    const kursy = [kurs()];
    const przed = [lekcja({ id: 31, is_completed: true }), lekcja({ id: 32, sequence_order: 2 })];
    expect(wyliczWznowienie(kursy, przed)).toMatchObject({ rodzaj: "lekcja", lekcja: { id: 32 } });
    const po = przed.map((l) => ({ ...l, is_completed: true }));
    expect(wyliczWznowienie(kursy, po)).toEqual({ rodzaj: "kurs", kurs: kurs() });
  });

  it("kontrola dodatnia: jeden kurs w toku odbiera gałąź „wszystko-ukonczone”", () => {
    const ukonczone = [kurs({ status: "completed" }), kurs({ id: 8, status: "completed" })];
    expect(wyliczWznowienie(ukonczone, [])).toEqual({ rodzaj: "wszystko-ukonczone" });
    const jedenWToku = [ukonczone[0], { ...ukonczone[1], status: "in_progress" as const }];
    expect(wyliczWznowienie(jedenWToku, [])).not.toEqual({ rodzaj: "wszystko-ukonczone" });
  });
});

describe("kursDoWznowienia", () => {
  it("wskazuje pierwszy kurs w toku w kolejności z API i nic, gdy takiego nie ma", () => {
    const kursy = [kurs({ id: 1, status: "completed" }), kurs({ id: 2 }), kurs({ id: 3 })];
    expect(kursDoWznowienia(kursy)?.id).toBe(2);
    expect(kursDoWznowienia(kursy.slice(0, 1))).toBeUndefined();
  });
});
