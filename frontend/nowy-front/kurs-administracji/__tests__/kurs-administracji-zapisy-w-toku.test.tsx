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

describe("drugie zatwierdzenie przed odpowiedzią serwera", () => {
  it("„Dodaj lekcję” kliknięte dwa razy zakłada jedną lekcję", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("POST", "/admin/courses/4/lessons", () => odpowiedz.obietnica);
    const { container } = await renderEkranu();
    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    const formularz = within(container.querySelector<HTMLElement>("[data-pod-tematem='8']")!).getByRole("form", {
      name: "Nowa lekcja",
    });
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), "Lekcja D");
    await userEvent.type(within(formularz).getByLabelText(/^Czas trwania w sekundach/), "120");

    await userEvent.dblClick(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));
    expect(zapisy("POST", "/admin/courses/4/lessons")).toHaveLength(1);

    await act(async () => {
      odpowiedz.zwolnij({ ...lekcja(100, "Lekcja D"), topic_id: 8, duration_seconds: 120 });
    });
    expect(await screen.findAllByRole("button", { name: "Edytuj lekcję „Lekcja D”" })).toHaveLength(1);

    // Flaga schodzi po odpowiedzi: następna lekcja daje się założyć.
    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    const drugi = within(container.querySelector<HTMLElement>("[data-pod-tematem='8']")!).getByRole("form", {
      name: "Nowa lekcja",
    });
    await userEvent.type(within(drugi).getByLabelText(/^Tytuł lekcji/), "Lekcja E");
    await userEvent.type(within(drugi).getByLabelText(/^Czas trwania w sekundach/), "60");
    await userEvent.click(within(drugi).getByRole("button", { name: "Dodaj lekcję" }));
    await waitFor(() => expect(zapisy("POST", "/admin/courses/4/lessons")).toHaveLength(2));
  });

  it("okno „Nowy temat”: dwa kliknięcia „Dodaj temat” dają jeden temat", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("POST", "/admin/courses/4/topics", () => odpowiedz.obietnica);
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Dodaj temat" }));
    const okno = screen.getByRole("dialog", { name: "Nowy temat" });
    await userEvent.type(within(okno).getByLabelText(/^Nazwa tematu/), "Podsumowanie");

    await userEvent.dblClick(within(okno).getByRole("button", { name: "Dodaj temat" }));
    expect(zapisy("POST", "/admin/courses/4/topics")).toHaveLength(1);

    await act(async () => {
      odpowiedz.zwolnij(temat(99, "Podsumowanie", 3, []));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByRole("heading", { level: 3, name: "Podsumowanie" })).toHaveLength(1);
  });

  it("okno „Zmień nazwę tematu”: Enter i kliknięcie dają jedno żądanie", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("PATCH", "/admin/topics/7", () => odpowiedz.obietnica);
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zmień nazwę tematu „Wprowadzenie”" }));
    const okno = screen.getByRole("dialog", { name: "Zmień nazwę tematu" });
    const pole = within(okno).getByLabelText(/^Nazwa tematu/);
    await userEvent.clear(pole);
    await userEvent.type(pole, "Wstęp{Enter}");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz nazwę" }));
    expect(zapisy("PATCH", "/admin/topics/7")).toHaveLength(1);

    await act(async () => {
      odpowiedz.zwolnij(temat(7, "Wstęp", 1, [21, 22]));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { level: 3, name: "Wstęp" })).toBeInTheDocument();
  });
});

describe("prowadzący kursu — żądania w toku", () => {
  it("„Przypisz prowadzącego” kliknięte dwa razy wysyła jedno żądanie, a przycisk jest na ten czas wyłączony", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("POST", "/admin/courses/4/assignments", () => odpowiedz.obietnica);
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    await within(sekcja).findByText("Cały kurs: brak prowadzącego");
    await wybierz(/^Prowadzący/, "Joanna Demo");

    const przycisk = within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" });
    await userEvent.dblClick(przycisk);
    expect(zapisy("POST", "/admin/courses/4/assignments")).toHaveLength(1);
    expect(przycisk).toBeDisabled();

    await act(async () => {
      odpowiedz.zwolnij({ id: 100, course_id: 4, lesson_id: null, instructor: PROWADZACY[0] });
    });
    expect(await within(sekcja).findByText("Cały kurs: Joanna Demo")).toBeInTheDocument();
    expect(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" })).toBeEnabled();
  });

  it("odłączenie w toku i przypisanie w tym czasie: po obu odpowiedziach lista ma oba skutki", async () => {
    serwer = utworzSerwer({
      przypisania: [{ id: 50, course_id: 4, lesson_id: null, instructor: PROWADZACY[0] }],
    });
    const odlaczenie = odroczona<unknown>();
    serwer.nadpisz("DELETE", "/admin/courses/4/assignments", () => odlaczenie.obietnica);
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    await within(sekcja).findByText("Cały kurs: Joanna Demo");

    await userEvent.click(within(sekcja).getByRole("button", { name: "Odłącz: Joanna Demo, Cały kurs" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Odłącz prowadzącego" }));
    await wybierz(/^Prowadzący/, "Adam Demo");
    await wybierz(/^Zakres/, "Lekcja C");
    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));
    expect(await within(sekcja).findByText("Lekcja C: Adam Demo")).toBeInTheDocument();

    await act(async () => {
      odlaczenie.zwolnij({ id: 50, deleted: true });
    });

    expect(await within(sekcja).findByText("Cały kurs: brak prowadzącego")).toBeInTheDocument();
    expect(within(sekcja).getByText("Lekcja C: Adam Demo")).toBeInTheDocument();
  });
});

describe("wyjście z niezapisanymi danymi", () => {
  it("„Wróć” z wypełnionym formularzem nowej lekcji pyta; „Zostań” zostawia wpisany tytuł", async () => {
    const { container } = await renderEkranu();
    expect(zamkniecieKartyZatrzymane()).toBe(false);
    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    const formularz = within(container.querySelector<HTMLElement>("[data-pod-tematem='8']")!).getByRole("form", {
      name: "Nowa lekcja",
    });
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), "Tytuł");

    expect(zamkniecieKartyZatrzymane()).toBe(true);
    await userEvent.click(powrot());

    const okno = screen.getByRole("dialog", { name: "Porzucić niezapisane zmiany w lekcji?" });
    expect(back).not.toHaveBeenCalled();
    await userEvent.click(within(okno).getByRole("button", { name: "Zostań" }));
    expect(back).not.toHaveBeenCalled();
    expect(within(formularz).getByLabelText(/^Tytuł lekcji/)).toHaveValue("Tytuł");

    await userEvent.click(powrot());
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Porzucić niezapisane zmiany w lekcji?" })).getByRole("button", {
        name: "Porzuć zmiany",
      }),
    );
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("„Wróć” ze zmienionymi danymi kursu pyta i nazywa dane kursu; zamknięcie karty też jest zatrzymane", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    // Formularz otwarty, ale bez zmian — nie ma o co pytać.
    expect(zamkniecieKartyZatrzymane()).toBe(false);
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł kursu/), " 2");

    expect(zamkniecieKartyZatrzymane()).toBe(true);
    await userEvent.click(powrot());

    const okno = screen.getByRole("dialog", { name: "Wyjść bez zapisu?" });
    expect(within(okno).getByText("Niezapisane zmiany w danych kursu zostaną utracone.")).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
    await userEvent.click(within(okno).getByRole("button", { name: "Zostań" }));
    expect(within(formularz).getByLabelText(/^Tytuł kursu/)).toHaveValue("Wywiad psychologiczny 2");

    await userEvent.click(powrot());
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Wyjdź bez zapisu" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("zmiany w drzewie i w danych kursu naraz: jedno pytanie nazywa oba miejsca", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    await userEvent.type(
      within(screen.getByRole("form", { name: "Dane kursu" })).getByLabelText(/^Tytuł kursu/),
      " 2",
    );
    await userEvent.click(powrot());
    expect(
      within(screen.getByRole("dialog", { name: "Wyjść bez zapisu?" })).getByText(
        "Niezapisane zmiany w drzewie kursu i w danych kursu zostaną utracone.",
      ),
    ).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
  });

  it("ekran bez zmian wychodzi od razu", async () => {
    await renderEkranu();
    await userEvent.click(powrot());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("publikacja", () => {
  it("„Cofnij publikację” najpierw pyta; „Anuluj” nie wysyła nic, potwierdzenie wysyła jedno PATCH", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    await renderEkranu();

    await userEvent.click(screen.getByRole("button", { name: "Cofnij publikację" }));
    const okno = screen.getByRole("dialog", { name: "Cofnąć publikację kursu?" });
    expect(within(okno).getByText("Kurs wróci do stanu „Szkic”.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([]);

    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(serwer.zapisy()).toEqual([]);
    expect(screen.getByText("Opublikowany")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cofnij publikację" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cofnij publikację" }));
    expect(await screen.findByText("Szkic")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: false } }]);
  });

  it("publikacja w toku: przycisk mówi „Publikowanie…” i jest zajęty; drugi klik nie wysyła drugiego żądania", async () => {
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("PATCH", "/admin/courses/4", () => odpowiedz.obietnica);
    await renderEkranu();

    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));
    const wToku = screen.getByRole("button", { name: "Publikowanie…" });
    expect(wToku).toHaveAttribute("aria-busy", "true");
    await userEvent.click(wToku);
    expect(zapisy("PATCH", "/admin/courses/4")).toHaveLength(1);

    await act(async () => {
      odpowiedz.zwolnij({ ...KURS, is_published: true });
    });
    expect(await screen.findByText("Opublikowany")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publikowanie…" })).toBeNull();
  });

  it("cofanie publikacji w toku: przycisk mówi „Cofanie publikacji…”, jest zajęty i trzyma fokus", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    const odpowiedz = odroczona<unknown>();
    serwer.nadpisz("PATCH", "/admin/courses/4", () => odpowiedz.obietnica);
    await renderEkranu();

    await userEvent.click(screen.getByRole("button", { name: "Cofnij publikację" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cofnij publikację" }));
    const wToku = await screen.findByRole("button", { name: "Cofanie publikacji…" });
    expect(wToku).toHaveAttribute("aria-disabled", "true");
    expect(wToku).toHaveAttribute("aria-busy", "true");
    expect(wToku).toHaveFocus();
    await userEvent.click(wToku);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zapisy("PATCH", "/admin/courses/4")).toHaveLength(1);

    await act(async () => {
      odpowiedz.zwolnij({ ...KURS, is_published: false });
    });
    expect(await screen.findByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
  });

  it("niezapisany układ: „Opublikuj kurs” nie wysyła żądania i mówi, co zrobić najpierw", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));

    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(serwer.zapisy()).toEqual([]);
    expect(screen.getByText("Kurs nie został opublikowany")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Najpierw zapisz albo porzuć zmiany w tematach i lekcjach. Publikacja obejmuje układ zapisany na serwerze, a nie ten z ekranu.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Szkic")).toBeInTheDocument();

    // Po zapisie układu ten sam przycisk publikuje, a zdanie znika.
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));
    expect(await screen.findByText("Opublikowany")).toBeInTheDocument();
    expect(screen.queryByText("Kurs nie został opublikowany")).toBeNull();
    expect(zapisy("PATCH", "/admin/courses/4")).toEqual([
      { sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } },
    ]);
  });
});

// Dane wspólne prób muszą zostać nietknięte przez ten plik.
it("atrapa: trzy lekcje w dwóch tematach", () => {
  expect(LEKCJE.map((l) => l.id)).toEqual([21, 22, 23]);
});
