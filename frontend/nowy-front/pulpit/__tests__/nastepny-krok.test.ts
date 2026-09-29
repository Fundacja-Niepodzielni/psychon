import { describe, expect, it } from "vitest";
import {
  etapySciezki,
  wyliczNastepnyKrok,
  type KursSciezki,
  type LekcjaKursu,
  type NastepnyKrok,
} from "../nastepny-krok";

function kurs(nadpisania: Partial<KursSciezki> = {}): KursSciezki {
  return {
    id: 1,
    slug: "podstawy-pomocy",
    title: "Podstawy pomocy psychologicznej",
    sequence_order: 1,
    status: "in_progress",
    progress_percent: 0,
    ...nadpisania,
  };
}

function lekcja(nadpisania: Partial<LekcjaKursu> = {}): LekcjaKursu {
  return {
    id: 21,
    title: "Wprowadzenie do wywiadu",
    sequence_order: 1,
    is_completed: false,
    ...nadpisania,
  };
}

describe("wyliczNastepnyKrok — tabela gałęzi (kod 0/2/3, kontrola dodatnia)", () => {
  const przypadki: Array<{
    nazwa: string;
    kursy: KursSciezki[];
    lekcjeEtapu: LekcjaKursu[];
    oczekiwany: NastepnyKrok;
  }> = [
    {
      nazwa: "1) etap w toku + pierwsza nieukończona lekcja → „lekcja”",
      kursy: [kurs({ id: 1, status: "in_progress", sequence_order: 1 })],
      lekcjeEtapu: [
        lekcja({ id: 21, sequence_order: 1, is_completed: true }),
        lekcja({ id: 22, sequence_order: 2, is_completed: false }),
        lekcja({ id: 23, sequence_order: 3, is_completed: false }),
      ],
      oczekiwany: {
        rodzaj: "lekcja",
        kurs: kurs({ id: 1, status: "in_progress", sequence_order: 1 }),
        lekcja: lekcja({ id: 22, sequence_order: 2, is_completed: false }),
      },
    },
    {
      nazwa: "2) etap w toku, wszystkie lekcje ukończone → „test”",
      kursy: [kurs({ id: 1, status: "in_progress" })],
      lekcjeEtapu: [
        lekcja({ id: 21, sequence_order: 1, is_completed: true }),
        lekcja({ id: 22, sequence_order: 2, is_completed: true }),
      ],
      oczekiwany: { rodzaj: "test", kurs: kurs({ id: 1, status: "in_progress" }) },
    },
    {
      nazwa: "3) cała ścieżka ukończona → „certyfikat”",
      kursy: [
        kurs({ id: 1, status: "completed", sequence_order: 1 }),
        kurs({ id: 2, status: "completed", sequence_order: 2, slug: "wywiad-psychologiczny" }),
      ],
      lekcjeEtapu: [],
      oczekiwany: { rodzaj: "certyfikat" },
    },
    {
      nazwa: "4) brak etapów (ścieżka pusta) → „brak”",
      kursy: [],
      lekcjeEtapu: [],
      oczekiwany: { rodzaj: "brak" },
    },
  ];

  it.each(przypadki)("$nazwa", ({ kursy, lekcjeEtapu, oczekiwany }) => {
    expect(wyliczNastepnyKrok(kursy, lekcjeEtapu)).toEqual(oczekiwany);
  });

  // --- Kontrola dodatnia: każdy przypadek wyżej zmieniony o jeden szczegół
  // ma dać INNY wynik — inaczej gałąź i tak przeszłaby przy zepsutej funkcji
  // (np. funkcji zwracającej zawsze to samo).

  it("kontrola dodatnia (1): oznaczenie wskazanej lekcji jako ukończonej przesuwa krok na kolejną", () => {
    const kursy = [kurs({ id: 1, status: "in_progress" })];
    const lekcjeEtapu = [
      lekcja({ id: 21, sequence_order: 1, is_completed: true }),
      lekcja({ id: 22, sequence_order: 2, is_completed: false }),
      lekcja({ id: 23, sequence_order: 3, is_completed: false }),
    ];
    const przed = wyliczNastepnyKrok(kursy, lekcjeEtapu);
    expect(przed).toMatchObject({ rodzaj: "lekcja", lekcja: { id: 22 } });

    const poZmianie = wyliczNastepnyKrok(
      kursy,
      lekcjeEtapu.map((l) => (l.id === 22 ? { ...l, is_completed: true } : l)),
    );
    expect(poZmianie).toMatchObject({ rodzaj: "lekcja", lekcja: { id: 23 } });
  });

  it("kontrola dodatnia (2): dołożenie nieukończonej lekcji cofa krok z „test” na „lekcja”", () => {
    const kursy = [kurs({ id: 1, status: "in_progress" })];
    const wszystkoUkonczone = [lekcja({ id: 21, sequence_order: 1, is_completed: true })];
    expect(wyliczNastepnyKrok(kursy, wszystkoUkonczone)).toEqual({
      rodzaj: "test",
      kurs: kurs({ id: 1, status: "in_progress" }),
    });

    const zDolozonaLekcja = [...wszystkoUkonczone, lekcja({ id: 22, sequence_order: 2, is_completed: false })];
    expect(wyliczNastepnyKrok(kursy, zDolozonaLekcja)).toMatchObject({ rodzaj: "lekcja", lekcja: { id: 22 } });
  });

  it("kontrola dodatnia (3): jeden nieukończony etap odbiera gałąź „certyfikat”", () => {
    const wszystkoUkonczone = [
      kurs({ id: 1, status: "completed", sequence_order: 1 }),
      kurs({ id: 2, status: "completed", sequence_order: 2, slug: "wywiad-psychologiczny" }),
    ];
    expect(wyliczNastepnyKrok(wszystkoUkonczone, [])).toEqual({ rodzaj: "certyfikat" });

    const jedenNieukonczony = wszystkoUkonczone.map((k) =>
      k.id === 2 ? { ...k, status: "in_progress" as const } : k,
    );
    expect(wyliczNastepnyKrok(jedenNieukonczony, [])).not.toEqual({ rodzaj: "certyfikat" });
  });

  it("kontrola dodatnia (4): dołożenie odblokowanego etapu zamienia „brak” na krok rzeczywisty", () => {
    expect(wyliczNastepnyKrok([], [])).toEqual({ rodzaj: "brak" });

    const zEtapem = [kurs({ id: 1, status: "in_progress" })];
    expect(wyliczNastepnyKrok(zEtapem, [])).not.toEqual({ rodzaj: "brak" });
  });
});

describe("etapySciezki", () => {
  it("odrzuca kursy bez sequence_order (webinary/zaproszenia poza ścieżką) i sortuje rosnąco", () => {
    const wynik = etapySciezki([
      kurs({ id: 3, sequence_order: 3, slug: "c" }),
      kurs({ id: 0, sequence_order: null, slug: "webinar" }),
      kurs({ id: 1, sequence_order: 1, slug: "a" }),
    ]);
    expect(wynik.map((k) => k.id)).toEqual([1, 3]);
  });

  it("kontrola dodatnia: usunięcie filtra ujawniłoby webinar na początku listy (dowód, że test naprawdę sprawdza filtrowanie)", () => {
    const wejscie = [kurs({ id: 0, sequence_order: null, slug: "webinar" }), kurs({ id: 1, sequence_order: 1 })];
    const wynik = etapySciezki(wejscie);
    expect(wynik.some((k) => k.id === 0)).toBe(false);
    expect(wejscie.some((k) => k.id === 0)).toBe(true);
  });
});
