import { describe, expect, it } from "vitest";
import {
  liczbaOdpowiedzi,
  pozostalePodejscia,
  pozostaloPoWyniku,
  przyciskPytania,
  przyciskStartu,
  przyciskWyniku,
  pytaniaZBledem,
  zdaniaPotwierdzenia,
  zdanieLekcji,
  zdanieWyniku,
  zostaloPodejsc,
} from "../logika";
import { PYTANIA, test, wynik } from "./atrapy";

describe("podejścia", () => {
  it("pozostałe podejścia liczy z limitu z odczytu, nigdy poniżej zera", () => {
    expect(pozostalePodejscia(test({ attempts_used: 1, attempts_limit: 4 }))).toBe(3);
    expect(pozostalePodejscia(test({ attempts_used: 5, attempts_limit: 3 }))).toBe(0);
    expect(pozostaloPoWyniku(test({ attempts_limit: 5 }), wynik({ attempt_number: 2 }))).toBe(3);
    expect(pozostaloPoWyniku(test({ attempts_limit: 2 }), wynik({ attempt_number: 2 }))).toBe(0);
  });

  it("odmiana: 1 podejście, 2–4 podejścia, 5 i 12–14 podejść, 22 podejścia", () => {
    expect(zostaloPodejsc(1)).toBe("Zostało Ci 1 podejście");
    expect(zostaloPodejsc(2)).toBe("Zostały Ci 2 podejścia");
    expect(zostaloPodejsc(5)).toBe("Zostało Ci 5 podejść");
    expect(zostaloPodejsc(12)).toBe("Zostało Ci 12 podejść");
    expect(zostaloPodejsc(22)).toBe("Zostały Ci 22 podejścia");
  });
});

describe("przycisk startu", () => {
  it("czynny, ze zdaniem o pozostałych podejściach i limicie z odczytu", () => {
    expect(przyciskStartu(test({ attempts_used: 1, attempts_limit: 4 }))).toEqual({
      etykieta: "Rozpocznij test",
      czynny: true,
      zdanie: "Zostały Ci 3 podejścia z 4.",
    });
  });

  it("bez podejść nieczynny i mówi dlaczego", () => {
    expect(przyciskStartu(test({ attempts_used: 4, attempts_limit: 4 }))).toEqual({
      etykieta: "Rozpocznij test",
      czynny: false,
      zdanie: "Wykorzystano wszystkie podejścia: 4 z 4. Skontaktuj się z zespołem programu, żeby zresetować limit podejść.",
    });
  });

  it("test bez pytań nieczynny i mówi dlaczego", () => {
    expect(przyciskStartu(test({ questions: [] }))).toMatchObject({ czynny: false, zdanie: "Ten test nie ma jeszcze pytań." });
  });
});

describe("przycisk w trakcie testu", () => {
  const baza = { odpowiedziane: false, ostatnie: false, wysylanie: false, podglad: false };

  it("bez odpowiedzi nieczynny ze zdaniem, z odpowiedzią czynny", () => {
    expect(przyciskPytania(baza)).toEqual({ etykieta: "Następne pytanie", czynny: false, zdanie: "Zaznacz odpowiedź, żeby przejść dalej." });
    expect(przyciskPytania({ ...baza, odpowiedziane: true })).toMatchObject({ etykieta: "Następne pytanie", czynny: true });
  });

  it("ostatnie pytanie: „Zakończ i sprawdź”; wysyłanie i podgląd nieczynne ze zdaniem", () => {
    expect(przyciskPytania({ ...baza, ostatnie: true })).toMatchObject({ etykieta: "Zakończ i sprawdź", czynny: false, zdanie: "Zaznacz odpowiedź, żeby zakończyć test." });
    expect(przyciskPytania({ ...baza, ostatnie: true, odpowiedziane: true })).toMatchObject({ czynny: true });
    expect(przyciskPytania({ ...baza, ostatnie: true, odpowiedziane: true, wysylanie: true })).toEqual({ etykieta: "Wysyłanie…", czynny: false, zdanie: "Sprawdzamy Twoje odpowiedzi." });
    expect(przyciskPytania({ ...baza, ostatnie: true, odpowiedziane: true, podglad: true })).toEqual({ etykieta: "Zakończ i sprawdź", czynny: false, zdanie: "W trybie podglądu odpowiedzi nie są wysyłane." });
  });
});

describe("wynik", () => {
  it("zaliczony: powrót do kursu i zdanie gratulacji", () => {
    expect(przyciskWyniku(test(), wynik())).toEqual({ etykieta: "Wróć do kursu", czynny: true, zdanie: "Test zaliczony." });
    expect(zdanieWyniku(test(), wynik())).toBe("Gratulacje — kolejny etap ścieżki został odblokowany.");
  });

  it("niezaliczony z podejściami: kolejne podejście czynne", () => {
    const niezaliczony = wynik({ passed: false, score_percent: 33, attempt_number: 2 });
    expect(przyciskWyniku(test({ attempts_limit: 4 }), niezaliczony)).toEqual({ etykieta: "Podejdź ponownie", czynny: true, zdanie: "Zostały Ci 2 podejścia z 4." });
    expect(zdanieWyniku(test({ attempts_limit: 3 }), niezaliczony)).toBe("Test niezaliczony. Zostało Ci 1 podejście.");
  });

  it("niezaliczony bez podejść: kolejne podejście nieczynne i zdanie dlaczego", () => {
    const ostatni = wynik({ passed: false, attempt_number: 4 });
    expect(przyciskWyniku(test({ attempts_limit: 4 }), ostatni)).toMatchObject({ czynny: false, zdanie: "Nie masz już podejść. Skontaktuj się z zespołem programu, żeby zresetować limit podejść." });
    expect(zdanieWyniku(test({ attempts_limit: 4 }), ostatni)).toMatch(/^Test niezaliczony\. Nie masz już podejść\./);
  });

  it("pytania z błędem w kolejności testu, bez identyfikatorów spoza testu", () => {
    expect(pytaniaZBledem(PYTANIA, wynik({ wrong_question_ids: [43, 999, 41] })).map((p) => p.id)).toEqual([41, 43]);
  });
});

describe("potwierdzenie przed wysłaniem", () => {
  it("nazywa liczbę pytań bez odpowiedzi z poprawną odmianą", () => {
    expect(liczbaOdpowiedzi(PYTANIA, { 41: 210, 999: 1 })).toBe(1);
    expect(zdaniaPotwierdzenia(PYTANIA, { 41: 210 })).toEqual([
      "Bez odpowiedzi: 2 pytania z 3.",
      "Pytanie bez odpowiedzi liczy się jako błędne.",
      "Po wysłaniu nie zmienisz odpowiedzi, a wysłanie zużywa jedno podejście.",
    ]);
    expect(zdaniaPotwierdzenia(PYTANIA, { 41: 210, 42: 220 })[0]).toBe("Bez odpowiedzi: 1 pytanie z 3.");
    expect(zdaniaPotwierdzenia(PYTANIA, { 41: 210, 42: 220, 43: 230 })).toEqual([
      "Bez odpowiedzi: 0 pytań z 3.",
      "Po wysłaniu nie zmienisz odpowiedzi, a wysłanie zużywa jedno podejście.",
    ]);
  });
});

describe("test zamknięty lekcjami", () => {
  it("liczba nieukończonych lekcji z odmianą, bez niej zdanie ogólne", () => {
    expect(zdanieLekcji(1)).toBe("Została Ci 1 lekcja do ukończenia. Test otworzy się po ostatniej z nich.");
    expect(zdanieLekcji(3)).toBe("Zostały Ci 3 lekcje do ukończenia. Test otworzy się po ostatniej z nich.");
    expect(zdanieLekcji(5)).toBe("Zostało Ci 5 lekcji do ukończenia. Test otworzy się po ostatniej z nich.");
    expect(zdanieLekcji(null)).toBe("Ukończ wszystkie lekcje kursu, a test się otworzy.");
  });
});
