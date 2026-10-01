import { describe, expect, it } from "vitest";
import { utworzKolejkeZapisu } from "../kolejka-zapisu";

interface Odroczenie {
  stan: string;
  przyjmij: () => void;
  odrzuc: (blad: unknown) => void;
}

/** Wysyłka, którą próba kończy sama — widać, co naprawdę poszło i w jakiej kolejności. */
function stanowisko() {
  const wyslane: Odroczenie[] = [];
  const zapisane: string[] = [];
  const odmowy: { blad: unknown; stan: string }[] = [];
  const kolejka = utworzKolejkeZapisu<string>(
    (stan) =>
      new Promise<void>((przyjmij, odrzuc) => {
        wyslane.push({ stan, przyjmij, odrzuc });
      }),
    {
      zapisano: (stan) => zapisane.push(stan),
      odmowa: (blad, stan) => odmowy.push({ blad, stan }),
    },
  );
  return { kolejka, wyslane, zapisane, odmowy };
}

const tik = () => new Promise((dalej) => setTimeout(dalej, 0));

describe("kolejka zapisu", () => {
  it("pierwsze zlecenie idzie od razu", () => {
    const { kolejka, wyslane } = stanowisko();
    kolejka.zlec("A");
    expect(wyslane.map((wpis) => wpis.stan)).toEqual(["A"]);
    expect(kolejka.zajeta()).toBe(true);
  });

  it("zlecenie w trakcie zapisu czeka na jego koniec — nigdy dwa żądania naraz", async () => {
    const { kolejka, wyslane, zapisane } = stanowisko();
    kolejka.zlec("A");
    kolejka.zlec("B");
    expect(wyslane).toHaveLength(1);

    wyslane[0].przyjmij();
    await tik();
    expect(wyslane.map((wpis) => wpis.stan)).toEqual(["A", "B"]);
    expect(zapisane).toEqual(["A"]);

    wyslane[1].przyjmij();
    await tik();
    expect(zapisane).toEqual(["A", "B"]);
    expect(kolejka.zajeta()).toBe(false);
  });

  it("z kilku oczekujących wysyłany jest wyłącznie najnowszy", async () => {
    const { kolejka, wyslane } = stanowisko();
    kolejka.zlec("A");
    kolejka.zlec("B");
    kolejka.zlec("C");
    kolejka.zlec("D");
    wyslane[0].przyjmij();
    await tik();
    expect(wyslane.map((wpis) => wpis.stan)).toEqual(["A", "D"]);
  });

  it("odmowa kasuje to, co czekało, i zgłasza błąd raz", async () => {
    const { kolejka, wyslane, zapisane, odmowy } = stanowisko();
    const blad = new Error("odmowa");
    kolejka.zlec("A");
    kolejka.zlec("B");
    wyslane[0].odrzuc(blad);
    await tik();
    expect(wyslane).toHaveLength(1);
    expect(zapisane).toEqual([]);
    expect(odmowy).toEqual([{ blad, stan: "A" }]);
    expect(kolejka.zajeta()).toBe(false);
  });

  it("po odmowie kolejne zlecenie idzie normalnie", async () => {
    const { kolejka, wyslane, zapisane } = stanowisko();
    kolejka.zlec("A");
    wyslane[0].odrzuc(new Error("odmowa"));
    await tik();
    kolejka.zlec("B");
    expect(wyslane.map((wpis) => wpis.stan)).toEqual(["A", "B"]);
    wyslane[1].przyjmij();
    await tik();
    expect(zapisane).toEqual(["B"]);
  });
});
