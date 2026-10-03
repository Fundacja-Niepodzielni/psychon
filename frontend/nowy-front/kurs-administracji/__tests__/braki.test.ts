import { describe, expect, it } from "vitest";
import {
  KOTWICA_DANYCH_KURSU,
  KOTWICA_DRZEWA,
  brakiZSerwera,
  kodStanuZOdpowiedzi,
  nagranieWDrodze,
  noweNagranie,
  powodyOdmowy,
  stanLekcji,
  stanPublikacji,
  stanWiersza,
  wymagaUwagi,
  zdanieDoZrobienia,
} from "../braki";
import { BEZ_NAGRANIA, KURS, lekcja, lekcjaZeStanem } from "./atrapa-serwera";

const adresLekcji = (id: number) => `/admin/kursy/4/lekcje/${id}`;

describe("stanLekcji", () => {
  it("nagranie bez odpowiedzi serwera albo gotowe: lekcja gotowa", () => {
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, undefined)).toBe("gotowa");
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "finished")).toBe("gotowa");
  });

  it("nagranie w przetwarzaniu i z błędem rozpoznaje odpowiedź serwera", () => {
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "processing")).toBe("przetwarzanie");
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "error")).toBe("blad-nagrania");
  });

  it("bez nagrania: treść wystarcza, sama biel nie", () => {
    expect(stanLekcji({ video_provider_id: null, content: "## Wstęp" }, undefined)).toBe("gotowa");
    expect(stanLekcji({ video_provider_id: null, content: "  \n " }, undefined)).toBe("pusta");
    expect(stanLekcji({ video_provider_id: null, content: null }, undefined)).toBe("pusta");
  });

  it("uwagi wymaga błąd nagrania i pusta lekcja, czekanie nie", () => {
    expect(wymagaUwagi("pusta")).toBe(true);
    expect(wymagaUwagi("blad-nagrania")).toBe(true);
    expect(wymagaUwagi("przetwarzanie")).toBe(false);
    expect(wymagaUwagi("gotowa")).toBe(false);
  });
});

describe("stanPublikacji", () => {
  it("kurs kompletny: nic do zrobienia, nic nie czeka, gotowe wymienia tytuł, opis i lekcje", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [lekcja(21, "A"), lekcja(22, "B"), lekcja(23, "C")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan).toEqual({ doZrobienia: [], czekamy: [], gotowe: ["tytuł", "opis", "3 lekcje"] });
  });

  it("brak opisu prowadzi do wiersza danych kursu, brak lekcji do karty lekcji", () => {
    const stan = stanPublikacji({ kurs: { ...KURS, description: "  " }, lekcje: [], nagrania: {}, adresLekcji });
    expect(stan.doZrobienia).toEqual([
      { id: "opis", tekst: "Kurs nie ma opisu.", href: `#${KOTWICA_DANYCH_KURSU}` },
      { id: "lekcje", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` },
    ]);
    expect(stan.gotowe).toEqual(["tytuł"]);
  });

  it("liczy lekcje z listy, nie z licznika kursu", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, lessons_count: 0 },
      lekcje: [lekcja(21, "A")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([]);
  });

  it("lekcje dzieli na do zrobienia i czekamy, z numerem z kolejności ekranu i adresem lekcji", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [
        lekcja(21, "A"),
        { ...lekcja(22, "B"), video_provider_id: null },
        lekcja(23, "C"),
        lekcja(24, "D"),
      ],
      nagrania: { 23: "processing", 24: "error" },
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([
      { id: "lekcja-22", tekst: "Lekcja 2: brak nagrania i treści.", href: "/admin/kursy/4/lekcje/22" },
      { id: "lekcja-24", tekst: "Lekcja 4: błąd nagrania.", href: "/admin/kursy/4/lekcje/24" },
    ]);
    expect(stan.czekamy).toEqual([
      { id: "lekcja-23", tekst: "Lekcja 3: nagranie się przetwarza, zwykle 10–30 minut." },
    ]);
    expect(stan.gotowe).toEqual(["tytuł", "opis", "1 lekcja"]);
  });

  it("bez strony lekcji brak prowadzi do karty lekcji", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [{ ...lekcja(21, "A"), video_provider_id: null }],
      nagrania: {},
      adresLekcji: () => null,
    });
    expect(stan.doZrobienia[0].href).toBe(`#${KOTWICA_DRZEWA}`);
  });

  it("liczba materiałów kursu nie jest brakiem", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, materials_count: 0 },
      lekcje: [lekcja(21, "A")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([]);
  });
});

describe("zdanieDoZrobienia", () => {
  it("odmienia rzeczownik przy liczbie", () => {
    expect(zdanieDoZrobienia(1)).toBe("do zrobienia 1 rzecz");
    expect(zdanieDoZrobienia(2)).toBe("do zrobienia 2 rzeczy");
    expect(zdanieDoZrobienia(5)).toBe("do zrobienia 5 rzeczy");
  });
});

describe("stanLekcji — pola stanu nagrania z serwera", () => {
  it("każdy stan nagrania lekcji bez gotowego nagrania ma swój stan wiersza", () => {
    const bezGotowego = { video_ready: false, video_pending: false };
    expect(stanLekcji(lekcjaZeStanem(21, "A"), undefined)).toBe("gotowa");
    expect(stanLekcji(lekcjaZeStanem(21, "A", { ...bezGotowego, video_status: "uploading" }), undefined)).toBe("wysylanie");
    expect(stanLekcji(lekcjaZeStanem(21, "A", { ...bezGotowego, video_status: "processing" }), undefined)).toBe("przetwarzanie");
    expect(stanLekcji(lekcjaZeStanem(21, "A", { ...bezGotowego, video_status: "error" }), undefined)).toBe("blad-nagrania");
    expect(stanLekcji(lekcjaZeStanem(21, "A", BEZ_NAGRANIA), undefined)).toBe("pusta");
  });

  it("bez nagrania: treść wystarcza, sama biel nie", () => {
    expect(stanLekcji(lekcjaZeStanem(21, "A", { ...BEZ_NAGRANIA, content: "## Wstęp" }), undefined)).toBe("gotowa");
    expect(stanLekcji(lekcjaZeStanem(21, "A", { ...BEZ_NAGRANIA, content: " \n " }), undefined)).toBe("pusta");
  });

  it("stan nieustalony (null) liczy się jak gotowe nagranie", () => {
    const nieustalony = lekcjaZeStanem(21, "A", { video_status: null, video_ready: true });
    expect(stanLekcji(nieustalony, undefined)).toBe("gotowa");
    expect(noweNagranie(nieustalony)).toBeNull();
    expect(nagranieWDrodze(nieustalony)).toBe(false);
  });

  it("pola serwera mają pierwszeństwo przed odpowiedzią starszego serwera o nagraniu", () => {
    expect(stanLekcji(lekcjaZeStanem(21, "A"), "error")).toBe("gotowa");
  });

  it("lekcja z gotowym nagraniem, której nowe nagranie jest w drodze albo z błędem, nie jest brakiem", () => {
    const wysylane = lekcjaZeStanem(21, "A", { video_status: "uploading", video_pending: true });
    const przetwarzane = lekcjaZeStanem(21, "A", { video_status: "processing", video_pending: true });
    const zBledem = lekcjaZeStanem(21, "A", { video_status: "error", video_pending: false });
    for (const lekcjaGotowa of [wysylane, przetwarzane, zBledem]) {
      expect(stanLekcji(lekcjaGotowa, undefined)).toBe("gotowa");
      expect(wymagaUwagi(stanLekcji(lekcjaGotowa, undefined))).toBe(false);
    }
    expect(noweNagranie(wysylane)).toBe("w-drodze");
    expect(noweNagranie(przetwarzane)).toBe("w-drodze");
    expect(noweNagranie(zBledem)).toBe("blad");
    expect(noweNagranie(lekcjaZeStanem(21, "A"))).toBeNull();
    // Bez gotowego nagrania dopisku nie ma: stan mówi wszystko.
    expect(noweNagranie(lekcjaZeStanem(21, "A", { video_status: "error", video_ready: false }))).toBeNull();
  });

  it("o stan pyta się tylko dla nagrań wysyłanych i przetwarzanych", () => {
    const wDrodze = (["none", "uploading", "processing", "ready", "error", null] as const).filter((video_status) =>
      nagranieWDrodze({ video_status }),
    );
    expect(wDrodze).toEqual(["uploading", "processing"]);
    expect(nagranieWDrodze({})).toBe(false);
  });

  it("odpowiedź o stanie nagrania: pole video_status, a bez niego stan ze status", () => {
    const reszta = { duration_seconds: 0, preview_embed_url: null };
    expect(kodStanuZOdpowiedzi({ status: "processing", ...reszta, video_status: "uploading" })).toBe("uploading");
    expect(kodStanuZOdpowiedzi({ status: "finished", ...reszta, video_status: null })).toBeNull();
    expect(kodStanuZOdpowiedzi({ status: "finished", ...reszta })).toBe("ready");
    expect(kodStanuZOdpowiedzi({ status: "error", ...reszta })).toBe("error");
    expect(kodStanuZOdpowiedzi({ status: "processing", ...reszta })).toBe("processing");
    expect(kodStanuZOdpowiedzi({ status: "no_video" })).toBe("none");
  });
});

describe("stanPublikacji — braki z serwera", () => {
  const lekcje = [
    lekcjaZeStanem(21, "A"),
    lekcjaZeStanem(22, "B", BEZ_NAGRANIA),
    lekcjaZeStanem(23, "C", { video_status: "error", video_ready: false }),
    lekcjaZeStanem(24, "D", { video_status: "processing", video_ready: false }),
    lekcjaZeStanem(25, "E", { video_status: "uploading", video_ready: false }),
  ];
  const kurs = {
    ...KURS,
    publication_gaps: {
      blocking: [
        { code: "lesson_empty", lesson_id: 22 },
        { code: "recording_error", lesson_id: 23 },
      ],
      waiting: [
        { code: "recording_in_progress", lesson_id: 24 },
        { code: "recording_in_progress", lesson_id: 25 },
      ],
    },
  };

  it("każdy kod z obu grup daje zdanie po polsku; blokujące mają odnośnik do lekcji", () => {
    const stan = stanPublikacji({ kurs, lekcje, nagrania: {}, adresLekcji });
    expect(stan.doZrobienia).toEqual([
      { id: "lesson_empty-22", tekst: "Lekcja 2: brak nagrania i treści.", href: "/admin/kursy/4/lekcje/22" },
      { id: "recording_error-23", tekst: "Lekcja 3: błąd nagrania.", href: "/admin/kursy/4/lekcje/23" },
    ]);
    expect(stan.czekamy).toEqual([
      { id: "recording_in_progress-24", tekst: "Lekcja 4: nagranie się przetwarza, zwykle 10–30 minut." },
      { id: "recording_in_progress-25", tekst: "Lekcja 5: nagranie się wysyła." },
    ]);
    expect(stan.gotowe).toEqual(["tytuł", "opis", "1 lekcja"]);
  });

  it("kurs bez lekcji: zdanie z odnośnikiem do karty lekcji", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, publication_gaps: { blocking: [{ code: "course_without_lessons", lesson_id: null }], waiting: [] } },
      lekcje: [],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([
      { id: "course_without_lessons-kurs", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` },
    ]);
  });

  it("lista jest listą serwera: front nie dokłada własnych braków i nie liczy ich z lekcji", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, description: null, publication_gaps: { blocking: [], waiting: [] } },
      lekcje: [{ ...lekcja(21, "A"), video_provider_id: null }],
      nagrania: { 21: "error" },
      adresLekcji,
    });
    expect(stan).toEqual({ doZrobienia: [], czekamy: [], gotowe: ["tytuł", "1 lekcja"] });
  });

  it("kolejność pozycji jest kolejnością serwera, numer lekcji — miejscem na ekranie", () => {
    const stan = stanPublikacji({
      kurs: {
        ...KURS,
        publication_gaps: {
          blocking: [
            { code: "recording_error", lesson_id: 23 },
            { code: "lesson_empty", lesson_id: 22 },
          ],
          waiting: [],
        },
      },
      lekcje,
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia.map((pozycja) => pozycja.tekst)).toEqual([
      "Lekcja 3: błąd nagrania.",
      "Lekcja 2: brak nagrania i treści.",
    ]);
  });

  it("wysyłanie z tej przeglądarki: procent w zdaniu, a przerwane prowadzi do lekcji", () => {
    const dane = { kurs, lekcje, nagrania: {}, adresLekcji };
    expect(
      stanPublikacji({ ...dane, wysylanie: { idLekcji: 25, rodzaj: "wysylanie", procent: 62 } }).czekamy[1],
    ).toEqual({ id: "recording_in_progress-25", tekst: "Lekcja 5: nagranie się wysyła (62 %)." });
    expect(stanPublikacji({ ...dane, wysylanie: { idLekcji: 25, rodzaj: "przerwane" } }).czekamy[1]).toEqual({
      id: "recording_in_progress-25",
      tekst: "Lekcja 5: wysyłanie nagrania przerwane.",
      href: "/admin/kursy/4/lekcje/25",
    });
  });

  it("kod spoza słownika i lekcja spoza ekranu: zdanie ogólne z odnośnikiem, nigdy puste miejsce", () => {
    const stan = stanPublikacji({
      kurs: {
        ...KURS,
        publication_gaps: {
          blocking: [
            { code: "nowy_kod", lesson_id: 22 },
            { code: "nowy_kod", lesson_id: null },
            { code: "lesson_empty", lesson_id: 99 },
          ],
          waiting: [],
        },
      },
      lekcje,
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([
      { id: "nowy_kod-22", tekst: "Lekcja 2: wymaga uzupełnienia.", href: "/admin/kursy/4/lekcje/22" },
      { id: "nowy_kod-kurs", tekst: "Kurs wymaga uzupełnienia.", href: `#${KOTWICA_DRZEWA}` },
      { id: "lesson_empty-99", tekst: "Jedna z lekcji: brak nagrania i treści.", href: `#${KOTWICA_DRZEWA}` },
    ]);
  });

  it("pole w złym kształcie jest brakiem pola: zachowanie dotychczasowe, bez błędu", () => {
    for (const zle of [null, "tak", { blocking: [] }, { blocking: "x", waiting: [] }]) {
      const kursZle = { ...KURS, description: null, publication_gaps: zle as never };
      expect(brakiZSerwera(kursZle)).toBeNull();
      expect(stanPublikacji({ kurs: kursZle, lekcje: [lekcja(21, "A")], nagrania: {}, adresLekcji }).doZrobienia).toEqual([
        { id: "opis", tekst: "Kurs nie ma opisu.", href: `#${KOTWICA_DANYCH_KURSU}` },
      ]);
    }
    expect(brakiZSerwera(KURS)).toBeNull();
  });

  it("wpis bez kodu albo z identyfikatorem lekcji w złym typie jest pomijany", () => {
    const braki = brakiZSerwera({
      publication_gaps: {
        blocking: [{ code: "lesson_empty", lesson_id: "22" }, { lesson_id: 22 }, { code: "lesson_empty", lesson_id: 22 }] as never,
        waiting: [],
      },
    });
    expect(braki).toEqual({ blocking: [{ code: "lesson_empty", lesson_id: 22 }], waiting: [] });
  });
});

describe("stanPublikacji — bez braków z serwera, z polami stanu lekcji", () => {
  it("nagranie wysyłane czeka obok przetwarzanego; gotowe z nowym nagraniem w drodze nie jest brakiem", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [
        lekcjaZeStanem(21, "A", { video_status: "uploading", video_ready: false }),
        lekcjaZeStanem(22, "B", { video_status: "processing", video_ready: true, video_pending: true }),
        lekcjaZeStanem(23, "C", { video_status: "error", video_ready: true }),
      ],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([]);
    expect(stan.czekamy).toEqual([{ id: "lekcja-21", tekst: "Lekcja 1: nagranie się wysyła." }]);
    expect(stan.gotowe).toEqual(["tytuł", "opis", "2 lekcje"]);
  });
});

describe("stanWiersza", () => {
  const braki = {
    blocking: [
      { code: "lesson_empty", lesson_id: 21 },
      { code: "recording_error", lesson_id: 22 },
    ],
    waiting: [{ code: "recording_in_progress", lesson_id: 23 }],
  };

  it("lekcja bez pól stanu bierze stan z braków kursu", () => {
    expect(stanWiersza(lekcja(21, "A"), undefined, braki)).toBe("pusta");
    expect(stanWiersza(lekcja(22, "B"), undefined, braki)).toBe("blad-nagrania");
    expect(stanWiersza(lekcja(23, "C"), undefined, braki)).toBe("przetwarzanie");
    expect(stanWiersza(lekcja(24, "D"), undefined, braki)).toBe("gotowa");
  });

  it("pola stanu lekcji mają pierwszeństwo przed brakami kursu", () => {
    expect(stanWiersza(lekcjaZeStanem(21, "A"), undefined, braki)).toBe("gotowa");
    expect(stanWiersza(lekcjaZeStanem(24, "D", BEZ_NAGRANIA), undefined, braki)).toBe("pusta");
  });

  it("bez braków i bez pól: jak dotąd", () => {
    expect(stanWiersza(lekcja(21, "A"), "processing", null)).toBe("przetwarzanie");
    expect(stanWiersza({ ...lekcja(21, "A"), video_provider_id: null }, undefined, null)).toBe("pusta");
  });
});

describe("powodyOdmowy", () => {
  const lekcje = [lekcjaZeStanem(21, "A"), lekcjaZeStanem(22, "B", BEZ_NAGRANIA), lekcjaZeStanem(23, "C")];
  const miejsca = { lekcje, adresLekcji };
  const message = "Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.";

  it("te same zdania i odnośniki co lista braków, w kolejności serwera", () => {
    const powody = powodyOdmowy(
      {
        message,
        reason: {
          missing: ["recording_error", "lesson_empty"],
          items: [
            { code: "recording_error", lesson_id: 23 },
            { code: "lesson_empty", lesson_id: 22 },
          ],
        },
      },
      miejsca,
    );
    expect(powody).toEqual([
      { id: "recording_error-23", tekst: "Lekcja 3: błąd nagrania.", href: "/admin/kursy/4/lekcje/23" },
      { id: "lesson_empty-22", tekst: "Lekcja 2: brak nagrania i treści.", href: "/admin/kursy/4/lekcje/22" },
    ]);
    // Na ekran idą zdania, nie kody.
    expect(powody!.map((powod) => powod.tekst).join(" ")).not.toMatch(/recording_error|lesson_empty|conditions_not_met/);
  });

  it("kurs bez lekcji", () => {
    expect(
      powodyOdmowy(
        { message, reason: { missing: ["lessons"], items: [{ code: "course_without_lessons", lesson_id: null }] } },
        miejsca,
      ),
    ).toEqual([{ id: "course_without_lessons-kurs", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` }]);
  });

  it("kod spoza słownika daje zdanie serwera — raz, obok znanych powodów", () => {
    const powody = powodyOdmowy(
      {
        message,
        reason: {
          items: [
            { code: "nowy_kod", lesson_id: 21 },
            { code: "lesson_empty", lesson_id: 22 },
            { code: "inny_nowy_kod", lesson_id: null },
          ],
        },
      },
      miejsca,
    );
    expect(powody).toEqual([
      { id: "serwer", tekst: message },
      { id: "lesson_empty-22", tekst: "Lekcja 2: brak nagrania i treści.", href: "/admin/kursy/4/lekcje/22" },
    ]);
  });

  it("kod spoza słownika przy pustym zdaniu serwera: zdanie zapasowe, nigdy pusta pozycja", () => {
    expect(powodyOdmowy({ message: " ", reason: { items: [{ code: "nowy_kod", lesson_id: 21 }] } }, miejsca)).toEqual([
      { id: "serwer", tekst: "Serwer odmówił publikacji kursu." },
    ]);
  });

  it("test końcowy bez pytań i kurs poza Programem PsychON: własne zdania w liście braków i w odmowie", () => {
    const braki = [
      { code: "final_test_without_questions", lesson_id: null },
      { code: "course_outside_program", lesson_id: null },
    ];
    const oczekiwane = [
      { id: "final_test_without_questions-kurs", tekst: "Test końcowy nie ma pytań." },
      { id: "course_outside_program-kurs", tekst: "Kurs nie ma miejsca w Programie PsychON." },
    ];
    const stan = stanPublikacji({
      kurs: { ...KURS, publication_gaps: { blocking: braki, waiting: [] } },
      lekcje,
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual(oczekiwane);
    expect(
      powodyOdmowy(
        {
          message: "Test końcowy nie ma pytań. Dodaj pytania albo usuń test.",
          reason: { missing: ["final_test_without_questions", "course_outside_program"], items: braki },
        },
        miejsca,
      ),
    ).toEqual(oczekiwane);
  });

  it("odmowa bez items: null — ekran pokazuje ją jak dotąd", () => {
    expect(powodyOdmowy({ message, reason: { missing: ["lessons"] } }, miejsca)).toBeNull();
    expect(powodyOdmowy({ message, reason: { items: [] } }, miejsca)).toBeNull();
    expect(powodyOdmowy({ message, reason: { items: "lesson_empty" } }, miejsca)).toBeNull();
    expect(powodyOdmowy({ message, reason: null }, miejsca)).toBeNull();
    expect(powodyOdmowy({ message }, miejsca)).toBeNull();
  });
});
