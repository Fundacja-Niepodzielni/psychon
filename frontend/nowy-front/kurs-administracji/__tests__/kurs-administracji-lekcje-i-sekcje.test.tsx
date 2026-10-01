import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji poza edycją lekcji:
 *  1) lekcja: dodanie w temacie (`POST …/lessons` z `topic_id`) i usunięcie
 *     z potwierdzeniem (`DELETE /admin/lessons/{id}`) — bez ponownego odczytu
 *     kursu, więc niezapisana kolejność zostaje;
 *  2) dane kursu: typ, grupa produktowa i identyfikator; pozycja w ścieżce
 *     tylko do odczytu i nigdy w ciele zapisu; adres zapisu kursu w jednym pliku;
 *  3) materiały kursu, prowadzący kursu, wejście do banku pytań;
 *  4) niezapisane zmiany w formularzu lekcji: każda droga, która by go
 *     zamknęła, najpierw pyta („Zostań” / „Porzuć zmiany”); odnośnika do
 *     ekranu lekcji nie ma, dopóki ten ekran nie ma adresu w panelu;
 *  5) fokus po zamknięciu formularza wraca na istniejący przycisk.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, refresh: vi.fn(), replace: vi.fn() }),
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
const { ApiError } = await import("@/lib/api/klient");

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function wiersz(container: HTMLElement, id: number) {
  return container.querySelector<HTMLElement>(`li[data-lekcja='${id}']`)!;
}

function edytuj(tytul: string) {
  return screen.getByRole("button", { name: `Edytuj lekcję „${tytul}”` });
}

async function otworz(container: HTMLElement, id: number, tytul: string) {
  await userEvent.click(edytuj(tytul));
  return within(wiersz(container, id)).findByRole("form", { name: "Edycja lekcji" });
}

async function zmienTytul(formularz: HTMLElement, tytul: string) {
  const pole = within(formularz).getByLabelText(/^Tytuł lekcji/);
  await userEvent.clear(pole);
  await userEvent.type(pole, tytul);
  return pole as HTMLInputElement;
}

function przelacznikKolejnosci() {
  return screen.getByRole("button", { name: "Kolejność" });
}

function odczytyLekcji() {
  return serwer.wywolania.filter((w) => w.metoda === "GET" && w.sciezka === "/admin/courses/4/lessons").length;
}

async function wybierz(etykieta: RegExp, opcja: string) {
  await userEvent.click(screen.getByRole("combobox", { name: etykieta }));
  await userEvent.click(await screen.findByRole("option", { name: opcja }));
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("lekcja — dodanie w temacie", () => {
  it("„Dodaj lekcję w tym temacie” otwiera formularz pod tym tematem; zapis to jedno POST z topic_id, lekcja staje w temacie", async () => {
    const { container } = await renderEkranu();
    const odczytyPrzed = odczytyLekcji();
    await userEvent.click(screen.getByTestId("ct-dodaj-8"));

    const podTematem = container.querySelector<HTMLElement>("[data-pod-tematem='8']")!;
    const formularz = within(podTematem).getByRole("form", { name: "Nowa lekcja" });
    expect(within(formularz).getByLabelText(/^Tytuł lekcji/)).toHaveFocus();
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), "Lekcja D");
    await userEvent.type(within(formularz).getByLabelText(/^Krótki opis lekcji/), "Opis D");
    await userEvent.type(within(formularz).getByLabelText(/^Czas trwania w minutach/), "2");
    await userEvent.click(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));

    const nowa = await screen.findByRole("button", { name: "Edytuj lekcję „Lekcja D”" });
    expect(serwer.zapisy()).toEqual([
      {
        sciezka: "/admin/courses/4/lessons",
        metoda: "POST",
        cialo: { title: "Lekcja D", description: "Opis D", duration_seconds: 120, topic_id: 8 },
      },
    ]);
    expect(container.querySelector("[data-pod-tematem]")).toBeNull();
    expect(nowa.closest("section")).toBe(screen.getByRole("heading", { level: 3, name: "Praktyka" }).closest("section"));
    expect(nowa).toHaveFocus();
    expect(odczytyLekcji()).toBe(odczytyPrzed);
  });

  it("pusty tytuł: błąd na polu, żadnego żądania", async () => {
    const { container } = await renderEkranu();
    await userEvent.click(screen.getByTestId("ct-dodaj-7"));
    const formularz = within(container.querySelector<HTMLElement>("[data-pod-tematem='7']")!).getByRole("form");
    await userEvent.click(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));

    expect(await within(formularz).findAllByText("Podaj tytuł lekcji.")).not.toHaveLength(0);
    expect(serwer.zapisy()).toEqual([]);
  });

  it("odmowa serwera (422): komunikat na polu, formularz zostaje, drzewo bez zmian", async () => {
    const { container } = await renderEkranu();
    serwer.nadpisz(
      "POST",
      "/admin/courses/4/lessons",
      () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { title: ["Tytuł lekcji może mieć najwyżej 255 znaków."] },
        }),
    );
    await userEvent.click(screen.getByTestId("ct-dodaj-7"));
    const formularz = within(container.querySelector<HTMLElement>("[data-pod-tematem='7']")!).getByRole("form");
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), "X");
    await userEvent.type(within(formularz).getByLabelText(/^Czas trwania w minutach/), "0");
    await userEvent.click(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));

    expect(await within(formularz).findAllByText("Tytuł lekcji może mieć najwyżej 255 znaków.")).not.toHaveLength(0);
    expect(container.querySelectorAll("li[data-lekcja]")).toHaveLength(3);
  });

  it("dodanie lekcji nie gubi niezapisanej zmiany kolejności", async () => {
    await renderEkranu();
    await userEvent.click(przelacznikKolejnosci());
    await userEvent.click(screen.getByRole("button", { name: /^Przenieś „Lekcja B” wyżej/ }));
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    await userEvent.type(screen.getByLabelText(/^Tytuł lekcji/), "Lekcja D");
    await userEvent.type(screen.getByLabelText(/^Czas trwania w minutach/), "0");
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję" }));
    await screen.findByRole("button", { name: "Edytuj lekcję „Lekcja D”" });

    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull());
    const uklad = serwer.zapisy().find((w) => w.sciezka === "/admin/courses/4/topics/reorder")!;
    expect(uklad.cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [22, 21] },
        { id: 8, lesson_ids: [23, 100] },
      ],
    });
  });
});

describe("lekcja — usunięcie z potwierdzeniem", () => {
  it("„Anuluj” w oknie nie wysyła nic; „Usuń lekcję” wysyła DELETE, wiersz znika, fokus dostaje „Dodaj lekcję” tego tematu", async () => {
    const { container } = await renderEkranu();
    const odczytyPrzed = odczytyLekcji();
    const formularz = await otworz(container, 22, "Lekcja B");
    const odczytyPoOtwarciu = odczytyLekcji();
    expect(odczytyPoOtwarciu).toBe(odczytyPrzed + 1);

    await userEvent.click(within(wiersz(container, 22)).getByRole("button", { name: "Usuń lekcję „Lekcja B”" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć lekcję „Lekcja B”?" });
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(serwer.zapisy()).toEqual([]);
    expect(formularz).toBeInTheDocument();

    await userEvent.click(within(wiersz(container, 22)).getByRole("button", { name: "Usuń lekcję „Lekcja B”" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Usunąć lekcję „Lekcja B”?" })).getByRole("button", {
        name: "Usuń lekcję",
      }),
    );

    await waitFor(() => expect(container.querySelector("li[data-lekcja='22']")).toBeNull());
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/lessons/22", metoda: "DELETE", cialo: undefined }]);
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("ct-dodaj-7"));
    expect(await screen.findByText("Lekcja została usunięta.")).toBeInTheDocument();
    expect(odczytyLekcji()).toBe(odczytyPoOtwarciu);
  });

  it("odmowa usunięcia: zdanie pod formularzem, lekcja zostaje", async () => {
    const { container } = await renderEkranu();
    serwer.nadpisz(
      "DELETE",
      "/admin/lessons/22",
      () => new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }),
    );
    await otworz(container, 22, "Lekcja B");
    await userEvent.click(within(wiersz(container, 22)).getByRole("button", { name: "Usuń lekcję „Lekcja B”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń lekcję" }));

    expect(await screen.findByText("Usunięcie lekcji nie jest dostępne dla Twojej roli.")).toBeInTheDocument();
    expect(container.querySelector("li[data-lekcja='22']")).not.toBeNull();
  });
});

describe("dane kursu", () => {
  it("formularz ma tytuł, opis, typ, grupę produktową i identyfikator; pozycja w ścieżce jest tekstem, nie polem", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("opis")!;
    expect(within(sekcja).getByText("Pozycja w ścieżce").nextElementSibling?.textContent).toBe("2");
    expect(within(sekcja).getByText("Identyfikator").nextElementSibling?.textContent).toBe("wywiad-psychologiczny");

    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    const etykiety = Array.from(formularz.querySelectorAll("label")).map((l) => l.textContent?.replace("*", "").trim());
    expect(etykiety).toEqual(["Tytuł kursu", "Opis kursu", "Typ", "Grupa produktowa", "Identyfikator"]);
    expect(formularz.textContent).not.toMatch(/slug/i);
    expect(within(formularz).queryByLabelText(/Pozycja/)).toBeNull();
  });

  it("zapis: jedno PATCH bez sequence_order, z typem, grupą i identyfikatorem", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    const identyfikator = within(formularz).getByLabelText(/^Identyfikator/);
    await userEvent.clear(identyfikator);
    await userEvent.type(identyfikator, "wywiad-2");
    await wybierz(/^Typ/, "Webinar");
    await wybierz(/^Grupa produktowa/, "Obie grupy");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: "Dane kursu" })).toBeNull());
    const zapisy = serwer.zapisy();
    expect(zapisy).toEqual([
      {
        sciezka: "/admin/courses/4",
        metoda: "PATCH",
        cialo: {
          title: KURS.title,
          description: KURS.description,
          slug: "wywiad-2",
          type: "webinar",
          product_group: "both",
        },
      },
    ]);
    expect(Object.keys(zapisy[0].cialo as object)).not.toContain("sequence_order");
    expect(within(document.getElementById("opis")!).getByText("Typ").nextElementSibling?.textContent).toBe("Webinar");
  });

  it("odmowa (422) na identyfikatorze: komunikat serwera na polu, formularz zostaje", async () => {
    await renderEkranu();
    serwer.nadpisz(
      "PATCH",
      "/admin/courses/4",
      () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { slug: ["Kurs o takim identyfikatorze już istnieje."] },
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    expect(await within(formularz).findAllByText("Kurs o takim identyfikatorze już istnieje.")).not.toHaveLength(0);
    expect(screen.getByRole("form", { name: "Dane kursu" })).toBeInTheDocument();
  });
});

describe("adres zapisu kursu administracji", () => {
  function pliki(katalog: string): string[] {
    return readdirSync(katalog).flatMap((nazwa) => {
      const sciezka = join(katalog, nazwa);
      if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : pliki(sciezka);
      return /\.tsx?$/.test(nazwa) ? [sciezka] : [];
    });
  }

  it("żądanie PATCH na /admin/courses/{id} buduje w nowym froncie jeden plik — dane „Publikacji kursu”", () => {
    const korzen = join(process.cwd(), "nowy-front");
    const zAdresem = pliki(korzen)
      .filter((plik) => {
        const kod = readFileSync(plik, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return /`\/admin\/courses\/\$\{[^}]+\}`\s*,\s*\{\s*method:\s*"PATCH"/.test(kod);
      })
      .map((plik) => plik.slice(korzen.length + 1).replace(/\\/g, "/"));

    expect(zAdresem).toEqual(["publikacja-kursu/dane.ts"]);
  });
});

describe("materiały kursu", () => {
  it("wgranie pliku: jedno POST na trasę kursu, licznik rośnie; usunięcie pyta i wysyła DELETE", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("materialy")!;
    expect(within(sekcja).getByText(/bez lekcji: 1\./)).toBeInTheDocument();

    const plik = new File(["tresc"], "karta-pracy.pdf", { type: "application/pdf" });
    await userEvent.upload(sekcja.querySelector<HTMLInputElement>("input[type='file']")!, plik);

    expect(await within(sekcja).findByText(/bez lekcji: 2\./)).toBeInTheDocument();
    const wgranie = serwer.zapisy()[0];
    expect(wgranie.sciezka).toBe("/admin/courses/4/materials");
    expect(wgranie.metoda).toBe("POST");
    expect(((wgranie.cialo as FormData).get("file") as File).name).toBe("karta-pracy.pdf");

    await userEvent.click(within(sekcja).getByRole("button", { name: "Usuń materiał „karta-pracy.pdf”" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć materiał „karta-pracy.pdf”?" });
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(serwer.zapisy()).toHaveLength(1);

    await userEvent.click(within(sekcja).getByRole("button", { name: "Usuń materiał „karta-pracy.pdf”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń materiał" }));

    expect(await within(sekcja).findByText(/bez lekcji: 1\./)).toBeInTheDocument();
    expect(serwer.zapisy()[1]).toEqual({ sciezka: "/admin/materials/100", metoda: "DELETE", cialo: undefined });
    expect(within(sekcja).queryByRole("button", { name: /^Usuń materiał/ })).toBeNull();
  });
});

describe("prowadzący kursu", () => {
  it("przypisanie do całego kursu: jedno POST; lekcje pokazują prowadzącego kursu; odłączenie pyta i wysyła DELETE", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    expect(await within(sekcja).findByText("Cały kurs: brak prowadzącego")).toBeInTheDocument();

    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));
    expect(within(sekcja).getByText("Wybierz prowadzącego do przypisania.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([]);

    await wybierz(/^Prowadzący/, "Joanna Demo");
    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));

    expect(await within(sekcja).findByText("Cały kurs: Joanna Demo")).toBeInTheDocument();
    expect(within(sekcja).getByText("Lekcja A: Joanna Demo (prowadzący całego kursu)")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([
      { sciezka: "/admin/courses/4/assignments", metoda: "POST", cialo: { instructor_id: 5, lesson_id: null } },
    ]);

    await userEvent.click(within(sekcja).getByRole("button", { name: "Odłącz: Joanna Demo, Cały kurs" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Odłącz prowadzącego" }));

    expect(await within(sekcja).findByText("Cały kurs: brak prowadzącego")).toBeInTheDocument();
    expect(serwer.zapisy()[1]).toEqual({
      sciezka: "/admin/courses/4/assignments",
      metoda: "DELETE",
      cialo: { assignment_id: 100 },
    });
  });

  it("przypisanie do jednej lekcji niesie jej identyfikator", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    await within(sekcja).findByText("Cały kurs: brak prowadzącego");
    await wybierz(/^Prowadzący/, "Adam Demo");
    await wybierz(/^Zakres/, "Lekcja C");
    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));

    expect(await within(sekcja).findByText("Lekcja C: Adam Demo")).toBeInTheDocument();
    expect(serwer.zapisy()[0].cialo).toEqual({ instructor_id: 6, lesson_id: 23 });
  });

  it("błąd odczytu: komunikat z „Spróbuj ponownie”, reszta ekranu działa", async () => {
    serwer.nadpisz(
      "GET",
      "/admin/courses/4/assignments",
      () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }),
    );
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    expect(await within(sekcja).findByText("Nie udało się wczytać prowadzących")).toBeInTheDocument();
    expect(edytuj("Lekcja A")).toBeInTheDocument();
  });
});

describe("bank pytań", () => {
  it("kurs z testem: odnośnik do banku pytań niesie identyfikator testu z serwera", async () => {
    await renderEkranu();
    const odnosnik = await screen.findByRole("link", { name: "Otwórz bank pytań" });
    expect(odnosnik).toHaveAttribute("href", "/admin/testy/31/pytania");
  });

  it("kurs bez testu: zdanie, żadnego odnośnika", async () => {
    serwer = utworzSerwer({ test: null });
    await renderEkranu();
    expect(await screen.findByText("Ten kurs nie ma jeszcze testu wiedzy.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Otwórz bank pytań" })).toBeNull();
  });
});

describe("niezapisane zmiany w formularzu lekcji", () => {
  it("„Edytuj” innej lekcji: „Zostań” zostawia jeden formularz z wpisaną wartością i fokusem w polu, bez zapisu", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 21, "Lekcja A");
    const pole = await zmienTytul(formularz, "Niezapisany tytuł");

    await userEvent.click(edytuj("Lekcja C"));
    const okno = screen.getByRole("dialog", { name: "Porzucić niezapisane zmiany w lekcji?" });
    expect(within(okno).getByRole("button", { name: "Zostań" })).toHaveFocus();
    await userEvent.click(within(okno).getByRole("button", { name: "Zostań" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelectorAll("[data-rozwiniecie-lekcji]")).toHaveLength(1);
    expect(wiersz(container, 21).querySelector("[data-rozwiniecie-lekcji]")).not.toBeNull();
    expect(pole.value).toBe("Niezapisany tytuł");
    expect(pole).toHaveFocus();
    expect(serwer.zapisy()).toEqual([]);
  });

  it("„Edytuj” innej lekcji: „Porzuć zmiany” otwiera jej formularz, bez zapisu", async () => {
    const { container } = await renderEkranu();
    await zmienTytul(await otworz(container, 21, "Lekcja A"), "Niezapisany tytuł");

    await userEvent.click(edytuj("Lekcja C"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Porzuć zmiany" }));

    expect(await within(wiersz(container, 23)).findByRole("form", { name: "Edycja lekcji" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-rozwiniecie-lekcji]")).toHaveLength(1);
    expect(serwer.zapisy()).toEqual([]);
  });

  it("bez zmian w formularzu okna nie ma: „Edytuj” innej lekcji, „Dodaj lekcję” i tryb kolejności działają od razu", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 21, "Lekcja A");
    await userEvent.click(edytuj("Lekcja C"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await within(wiersz(container, 23)).findByRole("form", { name: "Edycja lekcji" });

    await userEvent.click(screen.getByTestId("ct-dodaj-7"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(screen.getByRole("form", { name: "Nowa lekcja" })).toBeInTheDocument();
  });

  it("„Dodaj lekcję”: pyta; „Zostań” zostawia formularz lekcji, „Porzuć zmiany” otwiera formularz nowej lekcji", async () => {
    const { container } = await renderEkranu();
    const pole = await zmienTytul(await otworz(container, 21, "Lekcja A"), "Niezapisany tytuł");

    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zostań" }));
    expect(pole.value).toBe("Niezapisany tytuł");
    expect(screen.queryByRole("form", { name: "Nowa lekcja" })).toBeNull();

    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Porzuć zmiany" }));
    expect(screen.getByRole("form", { name: "Nowa lekcja" })).toBeInTheDocument();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(serwer.zapisy()).toEqual([]);
  });

  it("tryb kolejności: pyta; „Zostań” nie włącza trybu, „Porzuć zmiany” zamyka formularz, włącza tryb i zostawia fokus na przełączniku", async () => {
    const { container } = await renderEkranu();
    const pole = await zmienTytul(await otworz(container, 21, "Lekcja A"), "Niezapisany tytuł");

    await userEvent.click(przelacznikKolejnosci());
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zostań" }));
    expect(przelacznikKolejnosci()).toHaveAttribute("aria-pressed", "false");
    expect(pole.value).toBe("Niezapisany tytuł");

    await userEvent.click(przelacznikKolejnosci());
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Porzuć zmiany" }));
    expect(przelacznikKolejnosci()).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(document.activeElement).toBe(przelacznikKolejnosci());
    expect(serwer.zapisy()).toEqual([]);
  });

  it("tryb kolejności bez zmian w formularzu: formularz się zamyka, fokus zostaje na przełączniku", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 21, "Lekcja A");
    await userEvent.click(przelacznikKolejnosci());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(przelacznikKolejnosci()).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toBe(przelacznikKolejnosci());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("odnośnika „Materiały i nagranie” nie ma w formularzu przy wierszu, dopóki ekran lekcji nie ma adresu w panelu", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 22, "Lekcja B");

    expect(screen.queryByRole("link", { name: "Materiały i nagranie" })).toBeNull();
    expect(container.querySelector("a[href*='/lekcje/']")).toBeNull();
    expect(within(wiersz(container, 22)).getByRole("button", { name: "Usuń lekcję „Lekcja B”" })).toBeInTheDocument();
  });

  it("Escape przy otwartym oknie pytania zamyka tylko okno — formularz i wpisana wartość zostają", async () => {
    const { container } = await renderEkranu();
    const pole = await zmienTytul(await otworz(container, 21, "Lekcja A"), "Niezapisany tytuł");
    await userEvent.click(edytuj("Lekcja C"));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pole.value).toBe("Niezapisany tytuł");
    expect(wiersz(container, 21).querySelector("[data-rozwiniecie-lekcji]")).not.toBeNull();
  });
});

describe("powrót fokusu po zamknięciu formularza lekcji", () => {
  it("błąd odczytu lekcji i „Zamknij”: fokus wraca na „Edytuj” tego wiersza", async () => {
    const { container } = await renderEkranu();
    serwer.nadpisz(
      "GET",
      "/admin/courses/4/lessons",
      () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }),
    );
    await userEvent.click(edytuj("Lekcja B"));
    const li = wiersz(container, 22);
    await within(li).findByText("Nie udało się wczytać lekcji");
    await userEvent.click(within(li).getByRole("button", { name: "Zamknij" }));

    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(document.activeElement).toBe(edytuj("Lekcja B"));
  });
});

describe("powiadomienie o zapisie lekcji przy wierszu", () => {
  it("stoi pod formularzem, w rozwinięciu wiersza — nie w warstwie przyklejonej do dołu okna", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    await zmienTytul(formularz, "Lekcja B po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));

    const powiadomienie = await screen.findByText("Lekcja została zapisana.");
    const rozwiniecie = wiersz(container, 22).querySelector("[data-rozwiniecie-lekcji]")!;
    expect(rozwiniecie.contains(powiadomienie)).toBe(true);
    expect(powiadomienie.closest("[role='status']")?.parentElement?.className).toMatch(/powiadomienieWiersza/);
  });
});
