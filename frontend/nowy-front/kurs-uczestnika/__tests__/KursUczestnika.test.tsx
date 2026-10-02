import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { kursSzkicu, odpowiedzSerwera, STANY_SZKICU, TYTULY_LEKCJI, type OpcjeKursu } from "./atrapy";
import type { KursUczestnika as DaneKursu } from "../dane";

/**
 * Strona kursu uczestnika: cztery stany szkicu (teksty przycisku głównego i
 * zdania obok równe zapisowi z pomiaru szkicu, dokładnie jeden przycisk
 * główny), lekcja zamknięta i karta testu, brak pytania do prowadzącego i
 * materiałów kursu, stany spoza szkicu (ładowanie, błąd z ponowieniem, kurs
 * zamknięty kolejnością, brak kursu, dostęp wygasły, kurs bez lekcji), pas
 * podglądu. Każdy pomiar ma kontrolę dodatnią: zmiana danych, która MUSI
 * zmienić to, co widać.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { KursUczestnika } = await import("../KursUczestnika");

const SLUG = "pierwsza-pomoc-psychologiczna";

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

async function pokaz(kurs: DaneKursu | Promise<DaneKursu>, podglad = false, rola: string | null = "project_manager") {
  api.mockImplementation(() => Promise.resolve(kurs));
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<KursUczestnika slug={SLUG} podglad={podglad} rola={rola} />);
  });
  await screen.findByRole("heading", { level: 1 });
  return wynik!;
}

async function pokazBlad(blad: unknown) {
  api.mockImplementation(() => Promise.reject(blad));
  await act(async () => {
    render(<KursUczestnika slug={SLUG} />);
  });
  await screen.findByRole("heading", { level: 1 });
}

function przyciskiGlowne(korzen: ParentNode = document): HTMLElement[] {
  return [...korzen.querySelectorAll<HTMLElement>("[data-przycisk-glowny]")];
}

/** Elementy w kolejności fokusu (bez dodatnich `tabindex`, więc kolejność DOM). */
function kolejnoscFokusu(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
}

function wierszLekcji(id: number): HTMLElement {
  const wiersz = document.querySelector<HTMLElement>(`[data-lekcja="${id}"]`);
  if (wiersz === null) throw new Error(`Brak wiersza lekcji ${id}`);
  return wiersz;
}

function kartaTestu(): HTMLElement {
  const karta = document.querySelector<HTMLElement>("[data-karta-testu]");
  if (karta === null) throw new Error("Brak karty testu");
  return karta;
}

/** Pomiar używany przez kontrole dodatnie: to, co ekran pokazuje o przycisku głównym i zamkniętych lekcjach. */
function pomiar() {
  const glowne = przyciskiGlowne();
  const zamkniete = [...document.querySelectorAll<HTMLElement>("[data-zamknieta]")];
  return {
    liczbaGlownych: glowne.length,
    tekst: glowne.map((przycisk) => przycisk.textContent),
    powod: glowne.map((przycisk) => document.getElementById(przycisk.getAttribute("aria-describedby") ?? "")?.textContent ?? null),
    zamkniete: zamkniete.length,
    przyciskiWZamknietych: zamkniete.reduce((suma, wiersz) => suma + wiersz.querySelectorAll("a, button").length, 0),
  };
}

describe("cztery stany szkicu", () => {
  it.each(STANY_SZKICU)("stan $n ($nazwa): przycisk główny i zdanie obok jak w pomiarze szkicu, dokładnie jeden przycisk główny", async (stan) => {
    await pokaz(kursSzkicu(stan.opcje), stan.podglad);

    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne.map((przycisk) => przycisk.textContent)).toEqual([stan.primaryText]);
    expect(document.getElementById(glowne[0].getAttribute("aria-describedby") ?? "")).toHaveTextContent(stan.powod);
    expect(document.getElementById(glowne[0].getAttribute("aria-describedby") ?? "")?.textContent).toBe(stan.powod);
    // Żaden inny przycisk nie jest pełnym przyciskiem głównym.
    expect([...document.querySelectorAll("a, button")].filter((element) => /przyciskGlowny/.test(element.className))).toHaveLength(1);
  });

  it("tytuł, opis i postęp jak w szkicu (stan 2)", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    expect(screen.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeInTheDocument();
    expect(screen.getByText("7 lekcji · około 2 godziny · na końcu test")).toBeInTheDocument();
    expect(screen.getByText("2 z 7 lekcji ukończone")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Kryzys i jego przebieg" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Rozmowa wspierająca" })).toBeInTheDocument();
    expect(screen.getByText("2 z 4 lekcji")).toBeInTheDocument();
    expect(screen.getByText("0 z 3 lekcji")).toBeInTheDocument();
    expect(screen.getByText("14 min nagrania")).toBeInTheDocument();
    expect(screen.queryByText("Lekcje ukończone")).toBeNull();
  });

  it("stan 3: znacznik „Lekcje ukończone” przy tytule i czynny przycisk testu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7 }));
    expect(screen.getByText("Lekcje ukończone")).toBeInTheDocument();
    expect(within(kartaTestu()).getByRole("link", { name: "Przejdź do testu" })).toHaveAttribute("href", `/panel/kursy/${SLUG}/test`);
  });

  it("wiersze: etykiety, adresy lekcji i jedno zdanie opisu przycisku w stanie 2", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    const pierwszy = within(wierszLekcji(21)).getByRole("link");
    expect(pierwszy).toHaveTextContent("Otwórz ponownie");
    expect(pierwszy).toHaveAttribute("href", `/panel/lekcje/21?kurs=${SLUG}`);
    expect(within(wierszLekcji(23)).getByRole("link")).toHaveTextContent("Kontynuuj");
    expect(within(wierszLekcji(23)).getByRole("link", { name: "Kontynuuj: lekcja 3, Rozpoznawanie kryzysu psychicznego" })).toBeInTheDocument();
  });

  it("kontrola dodatnia: zmiana liczby ukończonych lekcji zmienia przycisk główny, powrót przywraca pomiar", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    const wyjsciowy = pomiar();
    expect(wyjsciowy.tekst).toEqual(["Kontynuuj lekcję 3"]);
    cleanup();

    await pokaz(kursSzkicu({ ukonczone: 3, zamknieteOd: 5 }));
    const zmieniony = pomiar();
    expect(zmieniony.tekst).toEqual(["Kontynuuj lekcję 4"]);
    expect(zmieniony).not.toEqual(wyjsciowy);
    cleanup();

    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    expect(pomiar()).toEqual(wyjsciowy);
  });
});

describe("lekcja zamknięta i karta testu", () => {
  it("lekcja z locked: true — kłódka, zdanie „Po ukończeniu lekcji N”, 0 przycisków i odnośników w wierszu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    const wiersz = wierszLekcji(24);
    expect(wiersz).toHaveAttribute("data-zamknieta");
    expect(within(wiersz).getByText("Po ukończeniu lekcji 3")).toBeInTheDocument();
    expect(wiersz.querySelector("svg")).not.toBeNull();
    expect(wiersz.querySelectorAll("a, button")).toHaveLength(0);
    expect(within(wierszLekcji(27)).getByText("Po ukończeniu lekcji 6")).toBeInTheDocument();
    expect(pomiar().zamkniete).toBe(4);
    expect(pomiar().przyciskiWZamknietych).toBe(0);
  });

  it("brak pola locked: wszystkie lekcje otwarte, każda ma przycisk", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2 }));
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(0);
    expect(screen.queryByText(/Po ukończeniu lekcji/)).toBeNull();
    for (let id = 21; id <= 27; id += 1) {
      expect(within(wierszLekcji(id)).getAllByRole("link")).toHaveLength(1);
    }
  });

  it("kontrola dodatnia: to samo kurs z polem locked ma zamknięte lekcje, bez pola — żadnej; powrót przywraca pomiar", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    const zPolem = pomiar();
    cleanup();
    await pokaz(kursSzkicu({ ukonczone: 2 }));
    const bezPola = pomiar();
    expect(zPolem.zamkniete).toBe(4);
    expect(bezPola.zamkniete).toBe(0);
    expect(bezPola).not.toEqual(zPolem);
    cleanup();
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    expect(pomiar()).toEqual(zPolem);
  });

  it("karta testu nieczynna: aria-disabled, kłódka, zdanie powodu, zostaje w kolejności fokusu i nie nawiguje", async () => {
    await pokaz(kursSzkicu({ ukonczone: 5 }));
    const karta = kartaTestu();
    const przycisk = within(karta).getByRole("button", { name: "Przejdź do testu" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).not.toBeDisabled();
    expect(przycisk.closest("a")).toBeNull();
    expect(przycisk).not.toHaveAttribute("href");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(przycisk.tabIndex).toBe(0);
    expect(kolejnoscFokusu()).toContain(przycisk);
    // Zdanie powodu obok i powiązane z przyciskiem.
    const zdanie = document.getElementById(przycisk.getAttribute("aria-describedby") ?? "");
    expect(zdanie).toHaveTextContent("Test odblokuje się, gdy ukończysz wszystkie lekcje. Zostało: 2.");
    // Kliknięcie nie nawiguje: domyślna akcja zdarzenia jest wstrzymana.
    expect(fireEvent.click(przycisk)).toBe(false);
    // Jest po ostatnim wierszu lekcji w kolejności fokusu.
    const kolejnosc = kolejnoscFokusu();
    const ostatniaLekcja = within(wierszLekcji(27)).getByRole("link");
    expect(kolejnosc.indexOf(przycisk)).toBeGreaterThan(kolejnosc.indexOf(ostatniaLekcja));
  });

  it("test_locked: false i wszystkie lekcje ukończone — karta testu czynna (odnośnik, bez aria-disabled)", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7, testZamkniety: false }));
    const odnosnik = within(kartaTestu()).getByRole("link", { name: "Przejdź do testu" });
    expect(odnosnik).toHaveAttribute("href", `/panel/kursy/${SLUG}/test`);
    expect(odnosnik).not.toHaveAttribute("aria-disabled");
    expect(within(kartaTestu()).queryByRole("button")).toBeNull();
  });

  it("test_locked: true przy wszystkich ukończonych lekcjach — karta testu nieczynna, pole ma pierwszeństwo", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7, testZamkniety: true }));
    expect(within(kartaTestu()).getByRole("button", { name: "Przejdź do testu" })).toHaveAttribute("aria-disabled", "true");
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("kontrola dodatnia: ukończenie ostatniej lekcji zmienia kartę testu z nieczynnej na czynną", async () => {
    await pokaz(kursSzkicu({ ukonczone: 6 }));
    expect(within(kartaTestu()).queryByRole("link")).toBeNull();
    expect(within(kartaTestu()).getByRole("button")).toHaveAttribute("aria-disabled", "true");
    cleanup();
    await pokaz(kursSzkicu({ ukonczone: 7 }));
    expect(within(kartaTestu()).getByRole("link")).toBeInTheDocument();
    expect(within(kartaTestu()).queryByRole("button")).toBeNull();
  });
});

describe("czego na stronie nie ma", () => {
  const MATERIALY = [{ id: 7, name: "Karta pracy.pdf", size: 2048, lesson_id: null, download_url: "/pliki/7" }];

  it.each(STANY_SZKICU)("stan $n: brak „Zadaj pytanie prowadzącemu” i sekcji materiałów, także gdy odczyt niesie materiały", async (stan) => {
    const kurs = { ...kursSzkicu(stan.opcje), materials: MATERIALY } as DaneKursu;
    await pokaz(kurs, stan.podglad);
    expect(document.body.textContent ?? "").not.toMatch(/Zadaj pytanie prowadzącemu/i);
    expect(document.body.textContent ?? "").not.toMatch(/pytanie/i);
    expect(screen.queryByText("Karta pracy.pdf")).toBeNull();
    expect(screen.queryByRole("heading", { name: /materiał/i })).toBeNull();
    expect(document.querySelector('a[href="/pliki/7"]')).toBeNull();
    expect(document.querySelectorAll("section")).toHaveLength(3);
  });

  it("kontrola dodatnia: wyszukiwanie wzorca trafia w tekst, który go zawiera", () => {
    const probka = document.createElement("div");
    probka.textContent = "Zadaj pytanie prowadzącemu";
    expect(/Zadaj pytanie prowadzącemu/i.test(probka.textContent)).toBe(true);
  });
});

describe("kolejność fokusu = kolejność ekranu", () => {
  it("stan 2: okruszek, powrót, przycisk główny, wiersze lekcji po kolei, na końcu karta testu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    const etykiety = kolejnoscFokusu().map((element) => (element.getAttribute("aria-label") ?? element.textContent ?? "").trim());
    expect(etykiety).toEqual([
      "Kursy",
      "Wróć do listy kursów",
      "Kontynuuj lekcję 3",
      "Otwórz ponownie: lekcja 1, Czym jest kryzys psychiczny",
      "Otwórz ponownie: lekcja 2, Fazy kryzysu",
      "Kontynuuj: lekcja 3, Rozpoznawanie kryzysu psychicznego",
      "Przejdź do testu",
    ]);
    expect(kolejnoscFokusu().every((element) => element.tabIndex <= 0)).toBe(true);
  });

  it("stan 4 (podgląd): pas podglądu jest pierwszy w kolejności fokusu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true);
    expect(kolejnoscFokusu()[0]).toHaveTextContent("Wróć do edycji kursu");
  });

  it("jeden korzeń main#tresc i jeden nagłówek pierwszego stopnia", async () => {
    const { container } = await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    jedenMain(container);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("tryb podglądu", () => {
  it("podgląd z rolą personelu: pas, zdanie, odnośnik do edycji kursu administracji i nic więcej", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true, "project_manager");
    const pas = screen.getByRole("region", { name: "Tryb podglądu" });
    expect(pas.textContent).toBe("Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.Wróć do edycji kursu");
    expect(within(pas).getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
  });

  it.each([
    ["project_manager", "/admin/kursy/2"],
    ["super_admin", "/admin/kursy/2"],
    ["instructor", "/prowadzacy/kursy/2"],
  ])("adres powrotu z pasa dla roli %s: %s", async (rola, adres) => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true, rola);
    expect(within(screen.getByRole("region", { name: "Tryb podglądu" })).getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", adres);
  });

  it("podgląd bez roli, która ma dokąd wrócić (uczestnik, brak roli): pasa nie ma, blokady zostają", async () => {
    for (const rola of ["volunteer", "student", null]) {
      await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true, rola);
      expect(screen.queryByRole("region", { name: "Tryb podglądu" }), String(rola)).toBeNull();
      expect(pomiar().zamkniete, String(rola)).toBe(4);
      cleanup();
    }
  });

  it("bez właściwości pasa nie ma, a lekcje zamknięte odczytem są zamknięte (kontrola dodatnia dla pomiaru poniżej)", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), false);
    expect(screen.queryByRole("region", { name: "Tryb podglądu" })).toBeNull();
    expect(screen.queryByText("Wróć do edycji kursu")).toBeNull();
    expect(pomiar().zamkniete).toBe(4);
    expect(screen.getAllByText(/Po ukończeniu lekcji/)).toHaveLength(4);
  });

  it("przy locked z odczytu 0 kłódek, każdy wiersz z przyciskiem, przycisk główny i karta testu jak w stanie 4 szkicu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true, "instructor");
    expect(pomiar()).toMatchObject({ zamkniete: 0, liczbaGlownych: 1, tekst: ["Kontynuuj lekcję 3"] });
    expect(screen.queryByText(/Po ukończeniu lekcji/)).toBeNull();
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(0);
    for (const id of [21, 22, 23, 24, 25, 26, 27]) {
      expect(within(wierszLekcji(id)).getAllByRole("link"), `lekcja ${id}`).toHaveLength(1);
    }
    expect(wierszLekcji(27).textContent).not.toMatch(/Po ukończeniu|zamknięta/i);
    expect(within(kartaTestu()).getByRole("button", { name: "Przejdź do testu" })).toHaveAttribute("aria-disabled", "true");
    expect(within(kartaTestu()).getByText("Test odblokuje się, gdy ukończysz wszystkie lekcje. Zostało: 5.")).toBeInTheDocument();
  });

  it("każdy odnośnik do lekcji i do testu niesie parametr podglądu; odnośnik wyjścia z kursu go nie niesie", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7 }), true, "super_admin");
    const doLekcji = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/panel/lekcje/"]')];
    expect(doLekcji).toHaveLength(7);
    for (const odnosnik of doLekcji) expect(odnosnik.getAttribute("href")).toMatch(/[?&]podglad=1(&|$)/);
    expect(doLekcji[0].getAttribute("href")).toBe(`/panel/lekcje/21?kurs=${SLUG}&podglad=1`);
    const doTestu = [...document.querySelectorAll<HTMLAnchorElement>(`a[href^="/panel/kursy/${SLUG}/test"]`)];
    expect(doTestu.length).toBeGreaterThanOrEqual(2);
    for (const odnosnik of doTestu) expect(odnosnik.getAttribute("href")).toBe(`/panel/kursy/${SLUG}/test?podglad=1`);
    expect(document.querySelector('a[href="/panel/kursy"]')?.getAttribute("href")).toBe("/panel/kursy");
  });

  it("kontrola dodatnia: bez podglądu odnośniki do lekcji i testu nie mają parametru", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7 }), false);
    const odnosniki = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/panel/lekcje/"], a[href$="/test"]')];
    expect(odnosniki.length).toBeGreaterThanOrEqual(8);
    for (const odnosnik of odnosniki) expect(odnosnik.getAttribute("href")).not.toMatch(/podglad/);
  });

  it("pas nie wnosi nagłówka: dalej jeden h1", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Tryb podglądu" }).querySelectorAll("h1,h2,h3")).toHaveLength(0);
  });
});

describe("pola odczytu bez kompletu (starsze zaplecze)", () => {
  it("pola postępu obecne — linia „W trakcie · obejrzane 12 z 16 potrzebnych minut” przy lekcji w toku, tylko tam", async () => {
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4, nowePola: true, wTrakcieNr: 3 }));
    expect(screen.getAllByText(/W trakcie · obejrzane/)).toHaveLength(1);
    expect(within(wierszLekcji(23)).getByText("W trakcie · obejrzane 12 z 16 potrzebnych minut")).toBeInTheDocument();
    expect(within(wierszLekcji(21)).queryByText(/W trakcie/)).toBeNull();
    expect(within(wierszLekcji(24)).queryByText(/W trakcie/)).toBeNull();
  });

  it("pól brak — ekran jak przed dodaniem pól: bez linii, z minutami nagrania, bez błędów w konsoli", async () => {
    const blad = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ostrzezenie = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    expect(screen.queryByText(/W trakcie/)).toBeNull();
    expect(within(wierszLekcji(26)).queryByText("do czytania")).toBeNull();
    expect(screen.getByText("14 min nagrania")).toBeInTheDocument();
    expect(pomiar()).toMatchObject({ tekst: ["Kontynuuj lekcję 3"], zamkniete: 4 });
    expect(blad).not.toHaveBeenCalled();
    expect(ostrzezenie).not.toHaveBeenCalled();
    blad.mockRestore();
    ostrzezenie.mockRestore();
  });

  it("lekcja bez nagrania (has_recording: false) ma opis „do czytania” bez minut; has_recording: true — minuty", async () => {
    await pokaz(kursSzkicu({ ukonczone: 0, nowePola: true }));
    expect(within(wierszLekcji(26)).getByText("do czytania")).toBeInTheDocument();
    expect(within(wierszLekcji(26)).queryByText(/min/)).toBeNull();
    expect(within(wierszLekcji(21)).getByText("14 min nagrania")).toBeInTheDocument();
    cleanup();
    const kurs = kursSzkicu({ ukonczone: 0 });
    kurs.lessons[5] = { ...kurs.lessons[5], has_recording: true, duration_seconds: 480 };
    await pokaz(kurs);
    expect(within(wierszLekcji(26)).getByText("8 min nagrania")).toBeInTheDocument();
  });

  it("test_passed — karta testu pokazuje „Test zaliczony.”, brak przycisku głównego; brak pola — zdanie jak dotąd", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7, testZaliczony: true }));
    expect(within(kartaTestu()).getByText("Test zaliczony.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    cleanup();
    await pokaz(kursSzkicu({ ukonczone: 7 }));
    expect(within(kartaTestu()).queryByText("Test zaliczony.")).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("„Kontynuuj” wskazuje lekcję z czasem aktywnym także wtedy, gdy wcześniejsza lekcja jest nieukończona bez postępu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 0, nowePola: true, wTrakcieNr: 3 }));
    expect(pomiar()).toMatchObject({ tekst: ["Kontynuuj lekcję 3"], powod: ["„Rozpoznawanie kryzysu psychicznego”"] });
    expect(within(wierszLekcji(23)).getByRole("link")).toHaveTextContent("Kontynuuj");
    expect(within(wierszLekcji(21)).getByRole("link")).toHaveTextContent("Rozpocznij lekcję");
  });

  it("bez pól postępu wraca reguła zastępcza — pierwsza nieukończona lekcja", async () => {
    await pokaz(kursSzkicu({ ukonczone: 0 }));
    expect(pomiar()).toMatchObject({ tekst: ["Rozpocznij lekcję 1"] });
  });
});

describe("stany ze szkicu biorą się z pól odpowiedzi serwera", () => {
  it("lekcje zamknięte kolejnością — z pola locked każdej lekcji: kłódka i „Po ukończeniu lekcji N”, bez przycisków", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 }));
    for (const id of [21, 22, 23]) expect(wierszLekcji(id).hasAttribute("data-zamknieta")).toBe(false);
    for (const [id, po] of [[24, 3], [25, 4], [26, 5], [27, 6]] as const) {
      const wiersz = wierszLekcji(id);
      expect(wiersz.hasAttribute("data-zamknieta")).toBe(true);
      expect(within(wiersz).getByText(`Po ukończeniu lekcji ${po}`)).toBeInTheDocument();
      expect(wiersz.querySelectorAll("a, button")).toHaveLength(0);
    }
  });

  it("serwer rozstrzyga: lekcja bez locked, choć poprzednia nieukończona (personel) — żadnej kłódki; kontrola dodatnia: ta sama odpowiedź z locked zamyka cztery", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3, zamykajZaNastepna: false }));
    expect(pomiar().zamkniete).toBe(0);
    cleanup();
    await pokaz(odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 }));
    expect(pomiar().zamkniete).toBe(4);
  });

  it("linia „obejrzane X z Y potrzebnych minut” — z active_seconds i required_active_seconds, tylko przy lekcji w toku", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 }));
    expect(screen.getAllByText(/W trakcie · obejrzane/)).toHaveLength(1);
    expect(within(wierszLekcji(23)).getByText("W trakcie · obejrzane 12 z 16 potrzebnych minut")).toBeInTheDocument();
    expect(pomiar()).toMatchObject({ tekst: ["Kontynuuj lekcję 3"] });
  });

  it("lekcja bez nagrania — „do czytania” z has_recording: false, także gdy zamknięta; required_active_seconds nie rysuje linii postępu", async () => {
    const kurs = odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 });
    kurs.lessons[5] = { ...kurs.lessons[5], has_recording: false, required_active_seconds: 0, active_seconds: 0 };
    await pokaz(kurs);
    expect(within(wierszLekcji(26)).getByText("do czytania")).toBeInTheDocument();
    expect(within(wierszLekcji(26)).queryByText(/min/)).toBeNull();
    expect(within(wierszLekcji(26)).queryByText(/obejrzane/)).toBeNull();
  });

  it("test zamknięty — z test_locked: true: karta nieczynna z kłódką, jeden przycisk główny prowadzi do lekcji", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 }));
    expect(kartaTestu().querySelector("[aria-disabled='true']")).not.toBeNull();
    expect(within(kartaTestu()).queryByRole("link")).toBeNull();
    expect(pomiar().liczbaGlownych).toBe(1);
  });

  it("test czynny — z test_locked: false przy wszystkich lekcjach ukończonych: odnośnik do testu i przycisk „Przejdź do testu”", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 7 }));
    expect(within(kartaTestu()).getByRole("link")).toHaveAttribute("href", "/panel/kursy/pierwsza-pomoc-psychologiczna/test");
    expect(pomiar()).toMatchObject({ tekst: ["Przejdź do testu"] });
  });

  it("test zaliczony — z test_passed: true: „Test zaliczony.”, bez przycisku głównego; test_passed: false w tej samej odpowiedzi — przycisk testu wraca", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 7, kurs: { test_passed: true, test_locked: false } }));
    expect(within(kartaTestu()).getByText("Test zaliczony.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    cleanup();
    await pokaz(odpowiedzSerwera({ ukonczone: 7, kurs: { test_passed: false, test_locked: false, status: "in_progress" } }));
    expect(within(kartaTestu()).queryByText("Test zaliczony.")).toBeNull();
    expect(pomiar()).toMatchObject({ tekst: ["Przejdź do testu"] });
  });

  it("pole test_passed ma pierwszeństwo przed stanem kursu: kurs „completed”, a test_passed: false — bez „Test zaliczony.”", async () => {
    await pokaz(odpowiedzSerwera({ ukonczone: 7, kurs: { status: "completed", test_passed: false, test_locked: false } }));
    expect(within(kartaTestu()).queryByText("Test zaliczony.")).toBeNull();
  });

  it("brak pól w odpowiedzi starszego zaplecza: ekran działa bez błędów w konsoli (lekcje otwarte, bez linii postępu)", async () => {
    const blad = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const kurs = odpowiedzSerwera({ ukonczone: 2, wTrakcieNr: 3 }) as unknown as Record<string, unknown>;
    delete kurs.test_locked;
    delete kurs.test_passed;
    delete kurs.has_test;
    const nowePola = ["locked", "active_seconds", "required_active_seconds", "has_recording"];
    kurs.lessons = (kurs.lessons as Record<string, unknown>[]).map((lekcja) => Object.fromEntries(Object.entries(lekcja).filter(([klucz]) => !nowePola.includes(klucz))));
    await pokaz(kurs as unknown as DaneKursu);
    expect(pomiar().zamkniete).toBe(0);
    expect(screen.queryByText(/W trakcie/)).toBeNull();
    expect(pomiar()).toMatchObject({ liczbaGlownych: 1, tekst: ["Kontynuuj lekcję 3"] });
    expect(blad).not.toHaveBeenCalled();
    blad.mockRestore();
  });
});

describe("stany spoza szkicu", () => {
  it("ładowanie: nagłówek „Kurs”, komunikat o ładowaniu i szkielet", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      render(<KursUczestnika slug={SLUG} />);
    });
    expect(screen.getByRole("heading", { level: 1, name: "Kurs" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie kursu…");
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("błąd odczytu (500): komunikat i „Spróbuj ponownie”, które ponawia odczyt i pokazuje kurs", async () => {
    await pokazBlad(new ApiError({ status: 500, code: "server_error", message: "Błąd" }));
    expect(screen.getByText("Nie udało się wczytać kursu")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);

    api.mockImplementation(() => Promise.resolve(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 })));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    await screen.findByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" });
    expect(api).toHaveBeenCalledTimes(2);
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("brak połączenia: osobny komunikat i ponowienie", async () => {
    await pokazBlad(new TypeError("Failed to fetch"));
    expect(screen.getByText("Brak połączenia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("403 course_locked: zdanie z message serwera i odnośnik do listy kursów", async () => {
    const zdanie = "Ukończ najpierw etap 2: Wywiad psychologiczny.";
    await pokazBlad(new ApiError({ status: 403, code: "course_locked", message: zdanie }));
    expect(screen.getByRole("heading", { level: 1, name: "Kurs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Ten kurs jest jeszcze zamknięty" })).toBeInTheDocument();
    expect(screen.getByText(zdanie)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/panel/kursy");
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("404: „Nie znaleziono kursu” i odnośnik do listy kursów", async () => {
    await pokazBlad(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }));
    expect(screen.getByRole("heading", { level: 1, name: "Kurs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono kursu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/panel/kursy");
  });

  it("dostęp wygasł (403 access_expired): zdanie na czas przekierowania", async () => {
    await pokazBlad(new ApiError({ status: 403, code: "access_expired", message: "Dostęp wygasł." }));
    expect(screen.getByRole("heading", { level: 1, name: "Kurs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Dostęp do kursów wygasł" })).toBeInTheDocument();
    expect(screen.getByText("Za chwilę przeniesiemy Cię na stronę z informacją o wygaśnięciu dostępu.")).toBeInTheDocument();
  });

  it("kurs bez lekcji: zdanie o braku lekcji, bez przycisku głównego, postępu i karty testu", async () => {
    const kurs: DaneKursu = { ...kursSzkicu({ ukonczone: 0 }), lessons: [] };
    await pokaz(kurs);
    expect(screen.getByText("Ten kurs nie ma jeszcze opublikowanych lekcji.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(document.querySelector("[data-karta-testu]")).toBeNull();
    expect(screen.getByText("0 lekcji · na końcu test")).toBeInTheDocument();
  });

  it("kurs ukończony w całości: znacznik „Kurs ukończony”, „Test zaliczony.”, bez przycisku głównego", async () => {
    await pokaz(kursSzkicu({ ukonczone: 7, status: "completed" }));
    expect(screen.getByText("Kurs ukończony")).toBeInTheDocument();
    expect(screen.getByText("Test zaliczony.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("kontrola dodatnia: 404 i 500 nie pokazują tego samego nagłówka komunikatu", async () => {
    await pokazBlad(new ApiError({ status: 404, code: "not_found", message: "x" }));
    const dla404 = screen.getByRole("heading", { level: 2 }).textContent;
    cleanup();
    await pokazBlad(new ApiError({ status: 500, code: "server_error", message: "x" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(dla404);
  });
});

describe("długie tytuły", () => {
  it("tytuł kursu i lekcji bez spacji trafia do DOM w całości, a korzeń ekranu zawija długie słowa", async () => {
    const dlugi = "Nadzwyczajnie".repeat(12);
    const kurs = kursSzkicu({ ukonczone: 0 });
    kurs.title = dlugi;
    kurs.lessons[0].title = dlugi;
    await pokaz(kurs);
    expect(screen.getByRole("heading", { level: 1, name: dlugi })).toBeInTheDocument();
    expect(within(wierszLekcji(21)).getByText(dlugi)).toBeInTheDocument();
  });
});

describe("zgodność atrap ze szkicem", () => {
  it("siedem lekcji o tytułach ze szkicu", () => {
    expect(TYTULY_LEKCJI).toHaveLength(7);
    const opcje: OpcjeKursu = { ukonczone: 0 };
    expect(kursSzkicu(opcje).lessons.map((lekcja) => lekcja.title)).toEqual([...TYTULY_LEKCJI]);
  });
});
