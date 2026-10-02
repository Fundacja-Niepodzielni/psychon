import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError } from "@/lib/api/klient";
import {
  ADRES_SPRAW,
  adresWewnetrzny,
  FORMY_SPRAW,
  jednostka,
  KLUCZ_KOLEJKI_BEZ_AKCJI,
  NAZWY_SPRAW,
  PODLINIA_KOLEJKI_BEZ_AKCJI,
  odczytajPulpit,
  rodzajBledu,
  zbudujWidok,
} from "../widok";
import { odpowiedzPulpitu } from "./atrapa";

interface SchematObiektu {
  properties?: Record<string, unknown>;
}

function schematPulpitu() {
  const plik = join(process.cwd(), "..", "backend", "openapi.json");
  const openapi = JSON.parse(readFileSync(plik, "utf-8")) as {
    paths: Record<string, { get: { responses: Record<string, { content: Record<string, { schema: SchematObiektu }> }> } }>;
  };
  const schemat = openapi.paths["/v1/admin/dashboard"].get.responses["200"].content["application/json"].schema;
  const dane = (schemat.properties as Record<string, { properties: Record<string, unknown> }>).data;
  const liczniki = dane.properties.counters as SchematObiektu;
  const kolejki = dane.properties.queues as { prefixItems: { properties: Record<string, { const?: string }> }[] };
  return {
    kluczeLicznikow: Object.keys(liczniki.properties ?? {}).sort(),
    kluczeKolejki: Object.keys(kolejki.prefixItems[0].properties).sort(),
    kodyKolejek: kolejki.prefixItems.map((pozycja) => pozycja.properties.key.const as string),
  };
}

/** Lista rozjazdów między atrapą a schematem; pusta oznacza zgodność. */
function rozjazdySchematu(atrapa: ReturnType<typeof odpowiedzPulpitu>): string[] {
  const schemat = schematPulpitu();
  const rozjazdy: string[] = [];
  const liczniki = Object.keys(atrapa.counters).sort();
  if (liczniki.join() !== schemat.kluczeLicznikow.join()) rozjazdy.push(`counters: ${liczniki.join()}`);
  for (const kolejka of atrapa.queues) {
    const klucze = Object.keys(kolejka).sort();
    if (klucze.join() !== schemat.kluczeKolejki.join()) rozjazdy.push(`queue ${kolejka.key}: ${klucze.join()}`);
  }
  return rozjazdy;
}

describe("odpowiedź pulpitu a schemat backend/openapi.json", () => {
  it("atrapa ma dokładnie klucze liczników i kolejek ze schematu", () => {
    expect(rozjazdySchematu(odpowiedzPulpitu())).toEqual([]);
  });

  it("usunięty klucz licznika albo kolejki daje rozjazd (kontrola porównania)", () => {
    const bezLicznika = odpowiedzPulpitu({ counters: { participants: 1, completed: 1 } });
    expect(rozjazdySchematu(bezLicznika).length).toBeGreaterThan(0);
    const bezLinku = odpowiedzPulpitu({ queues: [{ key: "applications", count: 1 }] });
    expect(rozjazdySchematu(bezLinku).length).toBeGreaterThan(0);
  });

  it("każdy kod kolejki ze schematu ma polską nazwę na ekranie", () => {
    const { kodyKolejek } = schematPulpitu();
    expect(kodyKolejek.length).toBeGreaterThan(0);
    expect(Object.keys(NAZWY_SPRAW).sort()).toEqual([...kodyKolejek].sort());
  });
});

describe("odczytajPulpit", () => {
  it("poprawna odpowiedź przechodzi bez zmian", () => {
    const wynik = odczytajPulpit(odpowiedzPulpitu());
    expect(wynik?.counters).toEqual({ participants: 12, completed: 3, certificates: 2 });
    expect(wynik?.queues).toHaveLength(4);
  });

  it("liczby w postaci tekstu cyfr są przyjmowane jako liczby", () => {
    const wynik = odczytajPulpit(odpowiedzPulpitu({ counters: { participants: "12", completed: "3", certificates: "0" } }));
    expect(wynik?.counters).toEqual({ participants: 12, completed: 3, certificates: 0 });
  });

  it.each([
    ["brak odpowiedzi", null],
    ["brak liczników", { queues: [] }],
    ["kolejki nie są listą", { counters: { participants: 1, completed: 1, certificates: 1 }, queues: {} }],
    ["ujemny licznik", odpowiedzPulpitu({ counters: { participants: -1, completed: 0, certificates: 0 } })],
    ["ułamek w liczniku", odpowiedzPulpitu({ counters: { participants: 1.5, completed: 0, certificates: 0 } })],
    ["kolejka bez adresu", odpowiedzPulpitu({ queues: [{ key: "applications", count: 1 }] })],
    ["kolejka z liczbą tekstową nie z cyfr", odpowiedzPulpitu({ queues: [{ key: "applications", count: "x", link: "/a" }] })],
  ])("zły kształt (%s) daje null", (_nazwa, surowe) => {
    expect(odczytajPulpit(surowe)).toBeNull();
  });
});

describe("adresWewnetrzny", () => {
  it.each(["/admin/staz", "/prowadzacy/pytania", "/"])("ścieżka %s jest przyjęta", (link) => {
    expect(adresWewnetrzny(link)).toBe(link);
  });

  it.each([
    "https://example.com",
    "//example.com",
    "javascript:alert(1)",
    "admin/staz",
    "/a\\b",
    "/a b",
    "/a\nb",
    "",
    null,
    42,
  ])("adres %j nie jest celem", (link) => {
    expect(adresWewnetrzny(link)).toBeNull();
  });
});

describe("zbudujWidok", () => {
  it("kafle niosą trzy liczniki z jednostką", () => {
    const widok = zbudujWidok(odczytajPulpit(odpowiedzPulpitu())!);
    expect(widok.kafle.map((k) => [k.id, k.wartosc, k.mianownik])).toEqual([
      ["pulpit-uczestnicy", 12, "osób"],
      ["pulpit-ukonczenia", 3, "osoby"],
      ["pulpit-certyfikaty", 2, "certyfikaty"],
    ]);
  });

  it.each([
    [0, "osób", "certyfikatów"],
    [1, "osoba", "certyfikat"],
    [4, "osoby", "certyfikaty"],
    [12, "osób", "certyfikatów"],
    [22, "osoby", "certyfikaty"],
  ])("jednostki kafli przy liczbie %i: osoba/certyfikat w odpowiedniej formie", (liczba, osoby, certyfikaty) => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({ counters: { participants: liczba, completed: liczba, certificates: liczba } }),
    )!;
    expect(zbudujWidok(dane).kafle.map((k) => k.mianownik)).toEqual([osoby, osoby, certyfikaty]);
  });

  it.each([
    [0, "spraw"],
    [1, "sprawa"],
    [3, "sprawy"],
    [5, "spraw"],
    [13, "spraw"],
  ])("forma jednostki spraw przy liczbie %i", (liczba, sprawy) => {
    expect(jednostka(liczba, FORMY_SPRAW)).toBe(sprawy);
  });

  it("cel przycisku „Otwórz sprawy” to ekran „Sprawy” ze wszystkimi rodzajami, nie adres kolejki zgłoszeń", () => {
    const widok = zbudujWidok(odczytajPulpit(odpowiedzPulpitu())!);
    expect(ADRES_SPRAW).toBe("/admin/sprawy");
    expect(widok.cel).toEqual({ nazwa: "Sprawy", liczba: 11, link: "/admin/sprawy" });
    expect(widok.cel?.link).not.toBe("/admin/uczestniczki");
    expect(widok.razem).toBe(18);
    expect(widok.brakSpraw).toBe(false);
    expect(widok.powodBrakuCelu).toBeNull();
  });

  it("cel nie zależy od kolejności kolejek ani od ich adresów w odpowiedzi", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({
        queues: [
          { key: "internship_entries", count: 9, link: "https://obcy.example" },
          { key: "applications", count: 2, link: "//obcy" },
        ],
      }),
    )!;
    const widok = zbudujWidok(dane);
    expect(widok.cel?.link).toBe("/admin/sprawy");
    expect(widok.wiersze[0].link).toBeNull();
  });

  it("bez kolejki zgłoszeń, ale z innymi sprawami: przycisk nadal prowadzi do „Spraw”", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({
        queues: [
          { key: "internship_entries", count: 7, link: "/admin/staz" },
          { key: "questions", count: 3, link: "/prowadzacy/pytania" },
        ],
      }),
    )!;
    const widok = zbudujWidok(dane);
    expect(widok.brakSpraw).toBe(false);
    expect(widok.cel).toEqual({ nazwa: "Sprawy", liczba: 7, link: "/admin/sprawy" });
    expect(widok.powodBrakuCelu).toBeNull();
  });

  it("zgłoszenia z liczbą 0 przy innych sprawach: przycisk prowadzi do „Spraw”", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 0, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 7, link: "/admin/staz" },
        ],
      }),
    )!;
    expect(zbudujWidok(dane).cel?.link).toBe("/admin/sprawy");
  });

  it("same pytania bez odpowiedzi (których „Sprawy” nie pokazują): brak celu z powodem", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 0, link: "/admin/uczestniczki" },
          { key: "questions", count: 3, link: "/prowadzacy/pytania" },
        ],
      }),
    )!;
    const widok = zbudujWidok(dane);
    expect(widok.brakSpraw).toBe(false);
    expect(widok.cel).toBeNull();
    expect(widok.powodBrakuCelu).toBe("Żadna sprawa nie czeka na decyzję.");
  });

  it("wszystkie liczby zerowe: brak spraw, brak celu, powód „Brak spraw do decyzji”", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 0, link: "/admin/uczestniczki" },
          { key: "questions", count: 0, link: "/prowadzacy/pytania" },
        ],
      }),
    )!;
    const widok = zbudujWidok(dane);
    expect(widok.brakSpraw).toBe(true);
    expect(widok.cel).toBeNull();
    expect(widok.powodBrakuCelu).toBe("Żadna sprawa nie czeka na decyzję.");
  });

  it("odpowiedź bez kolejek: brak spraw, brak celu, ten sam powód", () => {
    const widok = zbudujWidok(odczytajPulpit(odpowiedzPulpitu({ queues: [] }))!);
    expect(widok.brakSpraw).toBe(true);
    expect(widok.cel).toBeNull();
    expect(widok.powodBrakuCelu).toBe("Żadna sprawa nie czeka na decyzję.");
  });

  it("kolejka questions nie ma akcji i niesie adnotację; pozostałe kolejki są otwierane, bez adnotacji", () => {
    const widok = zbudujWidok(odczytajPulpit(odpowiedzPulpitu())!);
    const pytania = widok.wiersze.find((w) => w.id === KLUCZ_KOLEJKI_BEZ_AKCJI)!;
    expect(pytania.otwierany).toBe(false);
    expect(pytania.podlinia).toBe(PODLINIA_KOLEJKI_BEZ_AKCJI);
    expect(PODLINIA_KOLEJKI_BEZ_AKCJI).toBe("odpowiada prowadzący");
    expect(pytania.liczba).toBe(7);
    const inne = widok.wiersze.filter((w) => w.id !== KLUCZ_KOLEJKI_BEZ_AKCJI);
    expect(inne.length).toBeGreaterThan(0);
    expect(inne.every((w) => w.otwierany && w.podlinia === null)).toBe(true);
  });

  it("nieznany kod kolejki z adresem pytań jest otwierany: reguła po kluczu, nie po treści adresu", () => {
    const dane = odczytajPulpit(
      odpowiedzPulpitu({ queues: [{ key: "nowy_rodzaj", count: 1, link: "/prowadzacy/pytania" }] }),
    )!;
    expect(zbudujWidok(dane).wiersze[0].otwierany).toBe(true);
  });

  it("nieznany kod kolejki dostaje nazwę ogólną, nie surowy kod", () => {
    const dane = odczytajPulpit(odpowiedzPulpitu({ queues: [{ key: "nowy_rodzaj", count: 1, link: "/x" }] }))!;
    expect(zbudujWidok(dane).wiersze[0].nazwa).toBe("Inne sprawy");
  });
});

describe("rodzajBledu", () => {
  const blad = (status: number, code: string) => new ApiError({ status, code, message: "x" });

  it("401 i 403 to brak dostępu", () => {
    expect(rodzajBledu(blad(403, "forbidden"))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(401, "unauthenticated"))).toBe("brak-uprawnien");
  });

  it("5xx, błąd sieci i nie-ApiError to błąd odczytu", () => {
    expect(rodzajBledu(blad(500, "server_error"))).toBe("blad");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("blad");
    expect(rodzajBledu(undefined)).toBe("blad");
  });
});
