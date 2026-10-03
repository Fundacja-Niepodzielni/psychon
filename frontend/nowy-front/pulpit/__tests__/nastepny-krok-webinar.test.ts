import { describe, expect, it } from "vitest";
import { etapySciezki, pozycjeSciezki, wyliczNastepnyKrok, type KursSciezki, type LekcjaKursu } from "../nastepny-krok";
import { webinaryDoWykonania, wybierzNajblizszyWebinar } from "../webinar-karta";
import { odczytWebinaru } from "../../kurs-uczestnika/__tests__/webinar-atrapy";
import type { KursUczestnika } from "../../kurs-uczestnika/dane";

/**
 * Webinar na ścieżce pulpitu: nigdy nie prowadzi do kroku „test”, nie bywa
 * „w toku” w rozumieniu następnego kroku, nie blokuje następnego kursu i nie
 * jest zamknięty; wybór najbliższego nieukończonego webinaru do karty.
 */

function kurs(nadpisania: Partial<KursSciezki> & { id: number }): KursSciezki {
  return {
    slug: `kurs-${nadpisania.id}`,
    title: `Kurs ${nadpisania.id}`,
    sequence_order: nadpisania.id,
    status: "in_progress",
    progress_percent: 0,
    ...nadpisania,
  };
}

const webinar = (nadpisania: Partial<KursSciezki> & { id: number }): KursSciezki =>
  kurs({ type: "webinar", slug: `webinar-${nadpisania.id}`, title: `Webinar ${nadpisania.id}`, ...nadpisania });

const lekcja = (nadpisania: Partial<LekcjaKursu> & { id: number }): LekcjaKursu => ({
  title: `Lekcja ${nadpisania.id}`,
  sequence_order: nadpisania.id,
  is_completed: false,
  ...nadpisania,
});

describe("wyliczNastepnyKrok — webinar nie jest etapem kursu", () => {
  it("nieukończony webinar w toku nigdy nie daje kroku „test”: sam, bez kursów, to „brak”", () => {
    expect(wyliczNastepnyKrok([webinar({ id: 1, sequence_order: 1, status: "in_progress" })], [])).toEqual({ rodzaj: "brak" });
  });

  it("webinar przed kursem w kolejności nie przejmuje kroku: krok wskazuje nieukończony kurs", () => {
    const kursy = [webinar({ id: 1, sequence_order: 1, status: "in_progress" }), kurs({ id: 2, sequence_order: 2, status: "in_progress" })];
    expect(wyliczNastepnyKrok(kursy, [lekcja({ id: 21 })])).toMatchObject({ rodzaj: "lekcja", kurs: { id: 2 }, lekcja: { id: 21 } });
  });

  it("wszystkie lekcje kursu ukończone, a webinar nie: krok „test” dotyczy kursu, nie webinaru", () => {
    const kursy = [webinar({ id: 1, sequence_order: 1, status: "in_progress" }), kurs({ id: 2, sequence_order: 2, status: "in_progress" })];
    expect(wyliczNastepnyKrok(kursy, [lekcja({ id: 21, is_completed: true })])).toMatchObject({ rodzaj: "test", kurs: { id: 2 } });
  });

  it("nieukończony webinar nie blokuje: wszystkie kursy ukończone to „certyfikat”", () => {
    const kursy = [kurs({ id: 1, status: "completed" }), webinar({ id: 2, sequence_order: 2, status: "in_progress" })];
    expect(wyliczNastepnyKrok(kursy, [])).toEqual({ rodzaj: "certyfikat" });
  });

  it("webinar bez numeru w ścieżce (`sequence_order: null`) też nie wpływa na krok", () => {
    const kursy = [webinar({ id: 1, sequence_order: null, status: "in_progress" }), kurs({ id: 2, sequence_order: 1, status: "in_progress" })];
    expect(wyliczNastepnyKrok(kursy, [lekcja({ id: 21 })])).toMatchObject({ rodzaj: "lekcja", kurs: { id: 2 } });
  });

  it("webinar w stanie „locked” z serwera jest ignorowany, nie zamyka następnego kursu ani nie daje kroku", () => {
    const kursy = [webinar({ id: 1, sequence_order: 1, status: "locked" }), kurs({ id: 2, sequence_order: 2, status: "in_progress" })];
    expect(wyliczNastepnyKrok(kursy, [lekcja({ id: 21 })])).toMatchObject({ rodzaj: "lekcja", kurs: { id: 2 } });
  });

  it("kontrola dodatnia: ten sam układ bez pola `type` (zaplecze bez webinarów) traktuje pierwszą pozycję jak kurs", () => {
    const bezTypu = { ...webinar({ id: 1, sequence_order: 1, status: "in_progress" }), type: undefined };
    expect(wyliczNastepnyKrok([bezTypu], [])).toMatchObject({ rodzaj: "test", kurs: { id: 1 } });
  });
});

describe("etapySciezki i pozycjeSciezki", () => {
  it("etapy to wyłącznie kursy: webinar z numerem w ścieżce odpada, kolejność rosnąca", () => {
    const wynik = etapySciezki([kurs({ id: 3, sequence_order: 3 }), webinar({ id: 2, sequence_order: 2 }), kurs({ id: 1, sequence_order: 1 })]);
    expect(wynik.map((k) => k.id)).toEqual([1, 3]);
  });

  it("pozycje ścieżki to kursy i webinary razem, według numeru; webinar bez numeru na końcu, kurs bez numeru odpada", () => {
    const wynik = pozycjeSciezki([
      webinar({ id: 9, sequence_order: null }),
      kurs({ id: 3, sequence_order: 3 }),
      webinar({ id: 2, sequence_order: 2 }),
      kurs({ id: 1, sequence_order: 1 }),
      kurs({ id: 8, sequence_order: null, type: "course" }),
      webinar({ id: 7, sequence_order: null }),
    ]);
    expect(wynik.map((k) => k.id)).toEqual([1, 2, 3, 7, 9]);
  });

  it("kurs bez numeru i bez typu (poza ścieżką) nie wchodzi do pozycji ścieżki uczestnika", () => {
    expect(pozycjeSciezki([kurs({ id: 5, sequence_order: null })]).map((k) => k.id)).toEqual([]);
  });
});

describe("webinaryDoWykonania", () => {
  it("tylko webinary i tylko nieukończone; „locked” z serwera też liczy się jako do wykonania", () => {
    const wynik = webinaryDoWykonania([
      kurs({ id: 1, status: "in_progress" }),
      webinar({ id: 2, status: "completed" }),
      webinar({ id: 3, status: "in_progress" }),
      webinar({ id: 4, status: "locked" }),
    ]);
    expect(wynik.map((k) => k.id)).toEqual([3, 4]);
  });

  it("zaplecze bez webinarów: pusta lista", () => {
    expect(webinaryDoWykonania([kurs({ id: 1 }), kurs({ id: 2 })])).toEqual([]);
  });
});

describe("wybierzNajblizszyWebinar", () => {
  const ms = (iso: string) => new Date(iso).getTime();
  const teraz = ms("2026-11-05T17:30:00Z");
  const w = (nadpisania: Partial<KursUczestnika>): KursUczestnika => odczytWebinaru({ attendance_window: undefined, ...nadpisania });

  it("brak webinarów to `null`", () => {
    expect(wybierzNajblizszyWebinar([], teraz)).toBeNull();
  });

  it("webinar z otwartym oknem wygrywa z nadchodzącym i z zamkniętym", () => {
    const wynik = wybierzNajblizszyWebinar(
      [
        w({ id: 1, starts_at: "2026-11-12T17:00:00Z", attendance_closes_at: "2026-11-12T23:00:00Z" }),
        w({ id: 2, starts_at: "2026-11-05T17:00:00Z", attendance_closes_at: "2026-11-05T23:00:00Z" }),
        w({ id: 3, starts_at: "2026-10-01T17:00:00Z", attendance_closes_at: "2026-10-01T22:00:00Z", recording_lesson_id: 5 }),
      ],
      teraz,
    );
    expect(wynik?.id).toBe(2);
  });

  it("nadchodzące: wcześniejszy termin przed późniejszym", () => {
    const wynik = wybierzNajblizszyWebinar(
      [
        w({ id: 1, starts_at: "2026-11-19T17:00:00Z", attendance_closes_at: "2026-11-19T23:00:00Z" }),
        w({ id: 2, starts_at: "2026-11-12T17:00:00Z", attendance_closes_at: "2026-11-12T23:00:00Z" }),
      ],
      teraz,
    );
    expect(wynik?.id).toBe(2);
  });

  it("nadchodzący wygrywa z zamkniętym; zamknięty z nagraniem — z zamkniętym bez nagrania, a z dwóch takich nowszy", () => {
    const nadchodzacy = w({ id: 1, starts_at: "2026-11-19T17:00:00Z", attendance_closes_at: "2026-11-19T23:00:00Z" });
    const zNagraniem = w({ id: 2, starts_at: "2026-10-01T17:00:00Z", attendance_closes_at: "2026-10-01T22:00:00Z", recording_lesson_id: 5 });
    const zNagraniemNowszy = w({ id: 3, starts_at: "2026-10-20T17:00:00Z", attendance_closes_at: "2026-10-20T22:00:00Z", recording_lesson_id: 6 });
    const bezNagrania = w({ id: 4, starts_at: "2026-10-30T17:00:00Z", attendance_closes_at: "2026-10-30T23:00:00Z" });
    expect(wybierzNajblizszyWebinar([zNagraniem, nadchodzacy], teraz)?.id).toBe(1);
    expect(wybierzNajblizszyWebinar([bezNagrania, zNagraniem], teraz)?.id).toBe(2);
    expect(wybierzNajblizszyWebinar([zNagraniem, zNagraniemNowszy], teraz)?.id).toBe(3);
  });

  it("ukończone (status albo potwierdzona obecność) są pomijane; gdy nic nie zostaje, `null`", () => {
    const ukonczone = [
      w({ id: 1, status: "completed", progress_percent: 100 }),
      w({ id: 2, attended_at: "2026-11-05T17:04:11Z" }),
    ];
    expect(wybierzNajblizszyWebinar(ukonczone, teraz)).toBeNull();
    expect(wybierzNajblizszyWebinar([...ukonczone, w({ id: 3 })], teraz)?.id).toBe(3);
  });

  it("okno z zegara przesuwa się dalej niż migawka z odczytu", () => {
    const wynik = wybierzNajblizszyWebinar(
      [
        w({ id: 1, attendance_window: "before", starts_at: "2026-11-05T17:00:00Z", attendance_closes_at: "2026-11-05T23:00:00Z" }),
        w({ id: 2, attendance_window: "before", starts_at: "2026-11-05T10:00:00Z", attendance_closes_at: "2026-11-05T23:00:00Z" }),
      ],
      teraz,
    );
    // Oba są już otwarte według zegara; wcześniejszy początek wygrywa.
    expect(wynik?.id).toBe(2);
  });
});
