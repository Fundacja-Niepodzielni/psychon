import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJE, PROWADZACY, lekcja, temat, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji dla zapisów, które jeszcze trwają, i dla
 * wyjścia z niezapisanymi danymi:
 *  1) zmiana układu zrobiona w trakcie zapisu zostaje na ekranie jako
 *     niezapisana — odpowiedź serwera jej nie zdejmuje;
 *  2) drugie zatwierdzenie tego samego formularza albo okna przed odpowiedzią
 *     serwera nie wysyła drugiego żądania (nowa lekcja, nowy temat, zmiana
 *     nazwy tematu, przypisanie prowadzącego);
 *  3) „Wróć” i zamknięcie karty pytają także o niezapisany formularz lekcji
 *     i niezapisane dane kursu, nie tylko o zmiany w drzewie;
 *  4) cofnięcie publikacji pyta o potwierdzenie, przycisk publikacji mówi,
 *     że żądanie trwa, a publikacja przy niezapisanym układzie nie rusza;
 *  5) odpowiedzi dwóch nakładających się czynności na przypisaniach nie
 *     nadpisują się nawzajem.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

let serwer: AtrapaSerwera;
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

const { KursAdministracji } = await import("../KursAdministracji");

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

/** Odpowiedź, którą próba wypuszcza sama — żądanie „trwa”, dopóki jej nie zwolni. */
function odroczona<T>() {
  let zwolnij!: (wartosc: T) => void;
  const obietnica = new Promise<T>((spelnij) => {
    zwolnij = spelnij;
  });
  return { obietnica, zwolnij };
}

function zapisy(metoda: string, sciezka: string) {
  return serwer.zapisy().filter((w) => w.metoda === metoda && w.sciezka === sciezka);
}

function lekcjeTematu(nazwa: string) {
  const sekcja = screen.getByRole("heading", { level: 3, name: nazwa }).closest("section")!;
  return Array.from(sekcja.querySelectorAll("li[data-lekcja]")).map((li) => li.getAttribute("data-lekcja"));
}

async function wybierz(etykieta: RegExp, opcja: string) {
  await userEvent.click(screen.getByRole("combobox", { name: etykieta }));
  await userEvent.click(await screen.findByRole("option", { name: opcja }));
}

function powrot() {
  return screen.getByTestId("pageheader-powrot");
}

function zamkniecieKartyZatrzymane() {
  const zdarzenie = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(zdarzenie);
  return zdarzenie.defaultPrevented;
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("zapis układu — zmiana zrobiona w trakcie zapisu", () => {
  it("przeniesienie lekcji przed odpowiedzią serwera zostaje na ekranie jako niezapisana zmiana", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("PATCH", "/admin/courses/4/topics/reorder", () => odpowiedz.obietnica);
    await renderEkranu();

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja C” na koniec tematu „Wprowadzenie”" }));
    expect(lekcjeTematu("Wprowadzenie")).toEqual(["22", "21", "23"]);

    await act(async () => {
      odpowiedz.zwolnij([temat(7, "Wprowadzenie", 1, [22, 21]), temat(8, "Praktyka", 2, [23])]);
    });

    expect(lekcjeTematu("Wprowadzenie")).toEqual(["22", "21", "23"]);
    expect(lekcjeTematu("Praktyka")).toEqual([]);
    // Pasek zapisu zostaje: druga zmiana nie jest jeszcze na serwerze.
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();
    expect(zapisy("PATCH", "/admin/courses/4/topics/reorder")).toHaveLength(1);

    // Drugi zapis wysyła układ z ekranu, już bez odroczenia.
    serwer.nadpisz("PATCH", "/admin/courses/4/topics/reorder", () => [
      temat(7, "Wprowadzenie", 1, [22, 21, 23]),
      temat(8, "Praktyka", 2, []),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull());
    expect(zapisy("PATCH", "/admin/courses/4/topics/reorder")[1].cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [22, 21, 23] },
        { id: 8, lesson_ids: [] },
      ],
    });
  });

  it("zapis bez zmian w trakcie kończy się jak dotąd: pasek zapisu znika", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull());
    expect(lekcjeTematu("Wprowadzenie")).toEqual(["22", "21"]);
  });
});

// Dane wspólne prób muszą zostać nietknięte przez ten plik.
it("atrapa: trzy lekcje w dwóch tematach", () => {
  expect(LEKCJE.map((l) => l.id)).toEqual([21, 22, 23]);
});
