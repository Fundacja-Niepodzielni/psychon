import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  KURS,
  LEKCJE,
  utworzSerwer,
  type AtrapaSerwera,
} from "@/nowy-front/kurs-administracji/__tests__/atrapa-serwera";

/**
 * Próby ekranu A-12 w dwóch grupach tras — ta sama sekcja `KursTematy`,
 * ten sam scenariusz, różna grupa:
 *  - administracja: tematy, dane kursu i tytuł lekcji idą trasami `/admin/…`,
 *    a „Opublikuj kurs” naprawdę wysyła `PATCH /admin/courses/{id}` z
 *    `is_published`; 422 `conditions_not_met` otwiera panel braków, sukces
 *    zmienia plakietkę i zostawia drugorzędne „Cofnij publikację”;
 *  - prowadzący: te same zapisy trasami `/instructor/…`, a „Opublikuj kurs”
 *    nie wysyła żadnego żądania.
 * Atrapa stoi na funkcjach `api`/`apiPaged` OBU modułów klienta (`@/lib/api`
 * i `@/lib/api/klient`), więc funkcje danych sekcji wykonują się naprawdę.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
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

const { KursTematy } = await import("../KursTematy");
const { ApiError } = await import("@/lib/api/klient");

type Grupa = "admin" | "instructor";

async function renderGrupy(grupa: Grupa) {
  const wynik = render(
    <KursTematy grupa={grupa} idKursu="4" wynik={{ status: "ok", dane: { kurs: KURS, lekcje: LEKCJE } }} />,
  );
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe.each<Grupa>(["admin", "instructor"])("A-12 — grupa tras „%s”: każdy zapis idzie własną grupą", (grupa) => {
  const druga: Grupa = grupa === "admin" ? "instructor" : "admin";

  it("tematy czyta trasą swojej grupy i żadną trasą drugiej", async () => {
    await renderGrupy(grupa);
    expect(serwer.wywolania).toEqual([{ sciezka: `/${grupa}/courses/4/topics`, metoda: "GET", cialo: undefined }]);
    expect(serwer.sciezkiGrupy(druga)).toEqual([]);
  });

  it("układ tematów: jedno żądanie z pełną permutacją, trasą swojej grupy", async () => {
    await renderGrupy(grupa);
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await userEvent.click(
      within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull());

    expect(serwer.zapisy()).toEqual([
      {
        sciezka: `/${grupa}/courses/4/topics/reorder`,
        metoda: "PATCH",
        cialo: {
          topics: [
            { id: 7, lesson_ids: [21] },
            { id: 8, lesson_ids: [22, 23] },
          ],
        },
      },
    ]);
    expect(serwer.sciezkiGrupy(druga)).toEqual([]);
  });

  it("tytuł lekcji: PATCH lekcji trasą swojej grupy, z samym tytułem", async () => {
    await renderGrupy(grupa);
    await userEvent.click(screen.getByTestId("ct-edytuj-22"));
    const pole = screen.getByLabelText(/Tytuł lekcji/);
    await userEvent.clear(pole);
    await userEvent.type(pole, "Lekcja B po zmianie");
    await userEvent.click(
      within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull());

    expect(serwer.zapisy()).toEqual([
      { sciezka: `/${grupa}/lessons/22`, metoda: "PATCH", cialo: { title: "Lekcja B po zmianie" } },
    ]);
    expect(serwer.sciezkiGrupy(druga)).toEqual([]);
  });

  it("dane kursu: PATCH kursu trasą swojej grupy — w obu grupach sam tytuł i opis (adresu, rodzaju ani grupy produktowej nie wysyła), nigdy z pozycją w ścieżce", async () => {
    await renderGrupy(grupa);
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    // Rodzaj kursu wybiera się tylko przy jego zakładaniu: formularza edycji nie ma pola „Typ”.
    expect(screen.queryByLabelText(/^Typ/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /^Typ/ })).toBeNull();
    const opis = screen.getByLabelText(/Opis kursu/);
    await userEvent.clear(opis);
    await userEvent.type(opis, "Nowy opis.");
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Dane kursu" }));
    });

    expect(serwer.zapisy()).toEqual([
      { sciezka: `/${grupa}/courses/4`, metoda: "PATCH", cialo: { title: KURS.title, description: "Nowy opis." } },
    ]);
    const klucze = Object.keys(serwer.zapisy()[0].cialo as object);
    for (const zakazany of ["slug", "sequence_order", "type", "product_group"]) expect(klucze).not.toContain(zakazany);
    expect(await screen.findByText("Nowy opis.")).toBeInTheDocument();
    expect(serwer.sciezkiGrupy(druga)).toEqual([]);
  });

  it("adres kursu jest ukryty: formularz „Dane kursu” nie ma pola „Identyfikator” ani żadnego pola o adresie, tylko tytuł i opis", async () => {
    await renderGrupy(grupa);
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    expect(screen.queryByLabelText(/identyfikator|adres|slug/i)).toBeNull();
    expect(within(formularz).queryByDisplayValue(KURS.slug)).toBeNull();
    expect(within(formularz).queryByText(/identyfikator|adres|slug/i)).toBeNull();
    expect(within(formularz).getAllByRole("textbox")).toHaveLength(2);
  });

  it("adres kursu jest ukryty: w podglądzie danych nie ma wiersza „Identyfikator” ani samego adresu", async () => {
    const { container } = await renderGrupy(grupa);
    expect(screen.queryByText("Identyfikator")).toBeNull();
    expect(screen.queryByText(KURS.slug)).toBeNull();
    expect(container.textContent).not.toContain(KURS.slug);
    if (grupa === "admin") {
      // Typ i pozycja w ścieżce zostają.
      expect(screen.getByText("Typ")).toBeInTheDocument();
      expect(screen.getByText("Pozycja w ścieżce")).toBeInTheDocument();
    }
  });

  it("nowy temat: POST trasą swojej grupy", async () => {
    await renderGrupy(grupa);
    await userEvent.click(screen.getByRole("button", { name: "Dodaj temat" }));
    const okno = screen.getByRole("dialog", { name: "Nowy temat" });
    await userEvent.type(within(okno).getByLabelText(/Nazwa tematu/), "Podsumowanie");
    await userEvent.click(within(okno).getByRole("button", { name: "Dodaj temat" }));

    expect(await screen.findByRole("heading", { level: 3, name: "Podsumowanie" })).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([
      { sciezka: `/${grupa}/courses/4/topics`, metoda: "POST", cialo: { title: "Podsumowanie" } },
    ]);
    expect(serwer.sciezkiGrupy(druga)).toEqual([]);
  });
});

describe("A-12 — administracja: „Opublikuj kurs” naprawdę zmienia stan kursu", () => {
  it("sukces: jeden PATCH z samym is_published, plakietka „Opublikowany”, w miejscu przycisku drugorzędne „Cofnij publikację”", async () => {
    await renderGrupy("admin");
    expect(screen.getByText("Szkic")).toBeInTheDocument();
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);

    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(await screen.findByText("Opublikowany")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } }]);
    expect(screen.queryByText("Szkic")).toBeNull();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
    const cofnij = screen.getByRole("button", { name: "Cofnij publikację" });
    expect(przyciskiGlowne()).toEqual([]);
    expect(cofnij.className).toMatch(/outline/);
    expect(screen.getByRole("status")).toHaveTextContent("Kurs został opublikowany.");
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
  });

  it("422 conditions_not_met: panel braków z reason.missing, kurs zostaje szkicem, zamknięcie oddaje fokus przyciskowi", async () => {
    const { container } = await renderGrupy("admin");
    serwer.nadpisz(
      "PATCH",
      "/admin/courses/4",
      () =>
        new ApiError({
          status: 422,
          code: "conditions_not_met",
          message: "Kurs nie spełnia warunków publikacji.",
          reason: { missing: ["lessons"] },
        }),
    );

    const przycisk = screen.getByRole("button", { name: "Opublikuj kurs" });
    await userEvent.click(przycisk);

    const panel = await screen.findByRole("region", { name: "Braki przed publikacją" });
    expect(container.querySelector("[data-obszar='checklist']")!.contains(panel)).toBe(true);
    expect(within(panel).getByRole("link", { name: "Dodaj co najmniej jedną lekcję" })).toHaveAttribute(
      "href",
      "#lekcje",
    );
    expect(container.querySelector("#lekcje")).not.toBeNull();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } }]);
    expect(screen.getByText("Szkic")).toBeInTheDocument();
    expect(screen.queryByText("Opublikowany")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    await userEvent.click(within(panel).getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
    expect(document.activeElement).toBe(przycisk);
  });

  it("odmowa serwera (403): zdanie o roli, kurs zostaje szkicem, bez panelu braków", async () => {
    await renderGrupy("admin");
    serwer.nadpisz(
      "PATCH",
      "/admin/courses/4",
      () => new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(await screen.findByText("Nie udało się opublikować kursu")).toBeInTheDocument();
    expect(screen.getByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeInTheDocument();
    expect(screen.getByText("Szkic")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
  });

  it("„Cofnij publikację”: PATCH z is_published false, kurs wraca do szkicu z przyciskiem „Opublikuj kurs”", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    render(
      <KursTematy
        grupa="admin"
        idKursu="4"
        wynik={{ status: "ok", dane: { kurs: { ...KURS, is_published: true }, lekcje: LEKCJE } }}
      />,
    );
    await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cofnij publikację" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cofnij publikację" }));

    expect(await screen.findByText("Szkic")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: false } }]);
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);
    expect(screen.queryByRole("button", { name: "Cofnij publikację" })).toBeNull();
  });

  it("brak uprawnień do kursu: odmowa nazywa administrację, nie prowadzących", () => {
    render(<KursTematy grupa="admin" idKursu="4" wynik={{ status: "brak-uprawnien" }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText(/Ten ekran jest dla administracji\./)).toBeInTheDocument();
    expect(screen.queryByText(/prowadzących/)).toBeNull();
  });

  it("„Dodaj lekcję w tym temacie” otwiera formularz nowej lekcji na tym ekranie, bez przejścia na inny adres", async () => {
    await renderGrupy("admin");
    await userEvent.click(screen.getByTestId("ct-dodaj-7"));
    expect(screen.getByRole("form", { name: "Nowa lekcja" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("A-12 — prowadzący: „Opublikuj kurs” nie zmienia stanu kursu", () => {
  it("kurs opublikowany nadal pokazuje „Opublikuj kurs”, nigdy „Cofnij publikację”", async () => {
    render(
      <KursTematy
        grupa="instructor"
        idKursu="4"
        wynik={{ status: "ok", dane: { kurs: { ...KURS, is_published: true }, lekcje: LEKCJE } }}
      />,
    );
    await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
    expect(screen.getByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cofnij publikację" })).toBeNull();
  });

  it("kliknięcie nie wysyła żadnego zapisu — ani trasą prowadzącego, ani administracji", async () => {
    render(
      <KursTematy
        grupa="instructor"
        idKursu="4"
        wynik={{ status: "ok", dane: { kurs: { ...KURS, description: null }, lekcje: LEKCJE } }}
      />,
    );
    await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(screen.getByRole("region", { name: "Braki przed publikacją" })).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([]);
    expect(serwer.sciezkiGrupy("admin")).toEqual([]);
    expect(screen.getByText("Szkic")).toBeInTheDocument();
  });

  it("„Dodaj lekcję w tym temacie” prowadzi do edytora treści prowadzącego", async () => {
    await renderGrupy("instructor");
    await userEvent.click(screen.getByTestId("ct-dodaj-7"));
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy/4");
  });
});

describe("A-12 — grupa produktowa schowana", () => {
  it("administracja: dane kursu z grupą „obie” nie pokazują grupy, formularz nie ma pola, zapis nie wysyła product_group", async () => {
    render(
      <KursTematy
        grupa="admin"
        idKursu="4"
        wynik={{ status: "ok", dane: { kurs: { ...KURS, product_group: "both" }, lekcje: LEKCJE } }}
      />,
    );
    await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });

    expect(screen.getByText("Typ")).toBeInTheDocument();
    expect(screen.queryByText("Grupa produktowa")).toBeNull();
    expect(screen.queryByText("Obie grupy")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    expect(screen.getByRole("form", { name: "Dane kursu" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Grupa produktowa/)).toBeNull();
    expect(screen.queryByText("Grupa produktowa")).toBeNull();

    const opis = screen.getByLabelText(/Opis kursu/);
    await userEvent.type(opis, " Dopisek.");
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Dane kursu" }));
    });
    await waitFor(() => expect(serwer.zapisy()).toHaveLength(1));
    expect(Object.keys(serwer.zapisy()[0].cialo as object)).not.toContain("product_group");
  });
});
