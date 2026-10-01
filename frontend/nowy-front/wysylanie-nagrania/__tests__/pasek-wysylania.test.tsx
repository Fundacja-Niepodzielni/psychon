import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StanWysylania } from "../uchwyt";

/**
 * Pasek wysyłania u góry ramy i straż przejść. Stan wysyłania podaje próba,
 * więc każdy stan paska jest rysowany wprost, bez sieci i bez zegara.
 */

const srodowisko = vi.hoisted(() => ({
  stan: { rodzaj: "brak" } as unknown,
  sciezka: "/admin/kursy/4",
  push: vi.fn(),
  przerwij: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => srodowisko.sciezka,
  useRouter: () => ({ push: srodowisko.push }),
}));
vi.mock("../useWysylanie", () => ({ useWysylanie: () => srodowisko.stan }));
vi.mock("../uchwyt", () => ({ uchwytWysylania: { przerwij: srodowisko.przerwij } }));

const { PasekWysylania } = await import("../PasekWysylania");
const { StanWysylaniaWWierszu } = await import("../StanWysylaniaWWierszu");

const LEKCJA = { id: 22, tytul: "Trudny rozmówca", adres: "/admin/kursy/4/lekcje/22" };
const PLIK = { lekcja: LEKCJA, nazwa: "trudny-rozmowca.mp4", rozmiar: 1000, zastepuje: null };
const WYSYLANIE: StanWysylania = { rodzaj: "wysylanie", ...PLIK, wyslano: 620, zostaloSekund: 240 };
const PRZERWANE: StanWysylania = { rodzaj: "przerwane", ...PLIK, wyslano: 480, innyPlik: false };

/** Tekst bez twardych spacji — zdanie tak, jak czyta je osoba. */
function zdanie(wezel: Element | null): string {
  return (wezel?.textContent ?? "").replace(/ /g, " ");
}

function pasek(stan: StanWysylania, sciezka = "/admin/kursy/4") {
  srodowisko.stan = stan;
  srodowisko.sciezka = sciezka;
  const wynik = render(<PasekWysylania />);
  // Po obsługach paska (ta sama faza, późniejsza rejestracja): w próbie żadne kliknięcie nie przeładowuje dokumentu.
  window.addEventListener("click", zatrzymajPrzejscia);
  return wynik;
}

/**
 * Odnośnik poza paskiem, tak jak stoi na ekranie panelu. Obsługa kliknięcia
 * liczy wejścia i zatrzymuje przejście dokumentu (w próbie nie ma dokąd iść).
 */
function odnosnik(adres: string, atrybuty: Record<string, string> = {}) {
  const wezel = document.createElement("a");
  wezel.setAttribute("href", adres);
  wezel.textContent = `Odnośnik do ${adres}`;
  for (const [nazwa, wartosc] of Object.entries(atrybuty)) wezel.setAttribute(nazwa, wartosc);
  const wejscia = vi.fn();
  wezel.addEventListener("click", wejscia);
  document.body.appendChild(wezel);
  return { wezel, wejscia };
}

function zatrzymajPrzejscia(zdarzenie: Event) {
  zdarzenie.preventDefault();
}

beforeEach(() => {
  srodowisko.push.mockReset();
  srodowisko.przerwij.mockReset();
});

afterEach(() => {
  window.removeEventListener("click", zatrzymajPrzejscia);
  document.body.querySelectorAll("body > a").forEach((wezel) => wezel.remove());
});

describe("pasek u góry ramy", () => {
  it("bez wysyłania pasek nie rysuje niczego", () => {
    const { container } = pasek({ rodzaj: "brak" });
    expect(container).toBeEmptyDOMElement();
  });

  it("po wysłaniu całego pliku pasek znika", () => {
    const { container } = pasek({ rodzaj: "wyslane", lekcja: LEKCJA, zastepuje: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("w trakcie: zdanie z lekcją, procentem i czasem, pasek postępu i odnośnik do lekcji", () => {
    const { container } = pasek(WYSYLANIE);
    const rama = container.querySelector<HTMLElement>('[data-pasek-wysylania="wysylanie"]')!;
    expect(zdanie(rama.querySelector("p"))).toBe("Wysyłanie nagrania: Trudny rozmówca · 62 % · zostało ok. 4 min");
    const postep = within(rama).getByRole("progressbar", { name: "Wysyłanie nagrania lekcji Trudny rozmówca" });
    expect(postep).toHaveAttribute("aria-valuenow", "62");
    expect(postep).toHaveAttribute("data-postep-wysylania", "trwa");
    expect(within(rama).getByRole("link", { name: "Pokaż lekcję Trudny rozmówca" })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22#nagranie",
    );
  });

  it("bez oszacowania czasu zdanie kończy się na procencie", () => {
    const { container } = pasek({ ...WYSYLANIE, zostaloSekund: null });
    expect(zdanie(container.querySelector("p"))).toBe("Wysyłanie nagrania: Trudny rozmówca · 62 %");
  });

  it("czas krótszy niż minuta to „ok. 1 min”", () => {
    const { container } = pasek({ ...WYSYLANIE, zostaloSekund: 12 });
    expect(zdanie(container.querySelector("p"))).toMatch(/zostało ok\. 1 min$/);
  });

  it("na stronie tej lekcji pasek w trakcie wysyłania nie ma odnośnika; przerwany prowadzi do karty nagrania na tej samej stronie", () => {
    const { unmount } = pasek(WYSYLANIE, "/admin/kursy/4/lekcje/22");
    expect(screen.queryByRole("link")).toBeNull();
    unmount();
    pasek(PRZERWANE, "/admin/kursy/4/lekcje/22");
    expect(screen.getByRole("link", { name: "Dokończ wysyłanie nagrania lekcji Trudny rozmówca" })).toHaveAttribute("href", "#nagranie");
  });

  it("przerwane: zdanie z lekcją i „Dokończ” do strony lekcji; paska postępu nie ma", () => {
    const { container } = pasek(PRZERWANE);
    const rama = container.querySelector<HTMLElement>('[data-pasek-wysylania="przerwane"]')!;
    expect(zdanie(rama.querySelector("p"))).toBe("Wysyłanie przerwane: Trudny rozmówca");
    expect(within(rama).getByRole("link", { name: "Dokończ wysyłanie nagrania lekcji Trudny rozmówca" })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22#nagranie",
    );
    expect(within(rama).getByRole("link")).toHaveTextContent("Dokończ");
    expect(within(rama).queryByRole("progressbar")).toBeNull();
  });
});

describe("straż przejść w trakcie wysyłania", () => {
  it("odnośnik do ekranu bez paska: pytanie zamiast przejścia", () => {
    pasek(WYSYLANIE);
    const { wezel, wejscia } = odnosnik("/admin/ustawienia");
    const przeszlo = fireEvent.click(wezel);

    expect(przeszlo).toBe(false);
    expect(wejscia).not.toHaveBeenCalled();
    const okno = screen.getByRole("dialog", { name: "Wysyłanie nagrania zostanie przerwane" });
    expect(zdanie(okno)).toContain("wysyłanie nagrania lekcji „Trudny rozmówca” zostanie przerwane");
    expect(srodowisko.przerwij).not.toHaveBeenCalled();
    expect(srodowisko.push).not.toHaveBeenCalled();
  });

  it("„Zostań”: okno znika, wysyłanie trwa, fokus wraca na odnośnik", async () => {
    const uzytkownik = userEvent.setup();
    pasek(WYSYLANIE);
    const { wezel, wejscia } = odnosnik("/panel/pulpit");
    fireEvent.click(wezel);
    await uzytkownik.click(screen.getByRole("button", { name: "Zostań" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(srodowisko.przerwij).not.toHaveBeenCalled();
    expect(wejscia).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(wezel);
  });

  it("„Przejdź i przerwij wysyłanie”: wysyłanie przerwane, to samo kliknięcie idzie dalej już bez pytania", async () => {
    const uzytkownik = userEvent.setup();
    pasek(WYSYLANIE);
    const { wezel, wejscia } = odnosnik("/admin/ustawienia");
    fireEvent.click(wezel);
    await uzytkownik.click(screen.getByRole("button", { name: "Przejdź i przerwij wysyłanie" }));

    expect(srodowisko.przerwij).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(wejscia).toHaveBeenCalledTimes(1));
  });

  it("odnośnik do ekranu z paskiem, którego nikt nie obsłużył: przejście bez przeładowania dokumentu", () => {
    pasek(WYSYLANIE);
    const { wezel, wejscia } = odnosnik("/admin/kursy");
    fireEvent.click(wezel);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(wejscia).toHaveBeenCalledTimes(1);
    expect(srodowisko.push).toHaveBeenCalledWith("/admin/kursy");
  });

  it("odnośnik do ekranu z paskiem obsłużony przez ekran: pasek nie przechodzi drugi raz", () => {
    pasek(WYSYLANIE);
    const { wezel } = odnosnik("/admin/kursy/4");
    wezel.addEventListener("click", (zdarzenie) => zdarzenie.preventDefault());
    fireEvent.click(wezel);
    expect(srodowisko.push).not.toHaveBeenCalled();
  });

  it.each([
    ["kliknięcie z klawiszem Ctrl (nowa karta przeglądarki)", "/admin/ustawienia", {}, { ctrlKey: true }],
    ["odnośnik otwierany w nowej karcie przeglądarki", "/admin/ustawienia", { target: "_blank" }, {}],
    ["odnośnik pobrania pliku", "/admin/raport.csv", { download: "" }, {}],
    ["adres zewnętrzny", "https://przyklad.test/", {}, {}],
    ["kotwica na tej samej stronie", "#nagranie", {}, {}],
  ])("%s nie wywołuje pytania i nie jest przejmowane", (_opis, adres, atrybuty, klawisze) => {
    pasek(WYSYLANIE);
    const { wezel, wejscia } = odnosnik(adres as string, atrybuty as Record<string, string>);
    fireEvent.click(wezel, klawisze as MouseEventInit);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(wejscia).toHaveBeenCalledTimes(1);
    expect(srodowisko.push).not.toHaveBeenCalled();
  });

  it("zamknięcie karty przeglądarki w trakcie wysyłania wywołuje pytanie przeglądarki", () => {
    pasek(WYSYLANIE);
    const zamkniecie = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(zamkniecie);
    expect(zamkniecie.defaultPrevented).toBe(true);
  });

  it.each([
    ["bez wysyłania", { rodzaj: "brak" } as StanWysylania],
    ["przy przerwanym wysyłaniu", PRZERWANE],
  ])("%s nie ma pytania ani przy odnośniku, ani przy zamknięciu karty przeglądarki", (_opis, stan) => {
    pasek(stan);
    const { wezel, wejscia } = odnosnik("/admin/ustawienia");
    fireEvent.click(wezel);
    const zamkniecie = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(zamkniecie);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(wejscia).toHaveBeenCalledTimes(1);
    expect(zamkniecie.defaultPrevented).toBe(false);
    expect(srodowisko.push).not.toHaveBeenCalled();
  });

  it("po odmontowaniu paska straż znika", () => {
    const { unmount } = pasek(WYSYLANIE);
    unmount();
    const { wezel, wejscia } = odnosnik("/admin/ustawienia");
    fireEvent.click(wezel);
    expect(wejscia).toHaveBeenCalledTimes(1);
  });
});

describe("stan wysyłania w wierszu lekcji", () => {
  it("w trakcie: procent słowami i pasek postępu z nazwą lekcji", () => {
    const { container } = render(<StanWysylaniaWWierszu stan={WYSYLANIE as never} />);
    const wiersz = container.querySelector<HTMLElement>('[data-wysylanie-w-wierszu="wysylanie"]')!;
    expect(zdanie(wiersz)).toBe("Wysyłanie 62 %");
    expect(within(wiersz).getByRole("progressbar", { name: "Wysyłanie nagrania lekcji Trudny rozmówca" })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
  });

  it("przerwane: słowa, bez paska postępu", () => {
    const { container } = render(<StanWysylaniaWWierszu stan={PRZERWANE as never} />);
    const wiersz = container.querySelector<HTMLElement>('[data-wysylanie-w-wierszu="przerwane"]')!;
    expect(wiersz).toHaveTextContent("Wysyłanie przerwane");
    expect(within(wiersz).queryByRole("progressbar")).toBeNull();
  });

  it("po wysłaniu całego pliku: przetwarzanie", () => {
    const { container } = render(<StanWysylaniaWWierszu stan={{ rodzaj: "wyslane", lekcja: LEKCJA, zastepuje: null }} />);
    expect(container).toHaveTextContent("Nagranie: przetwarzanie");
  });
});
