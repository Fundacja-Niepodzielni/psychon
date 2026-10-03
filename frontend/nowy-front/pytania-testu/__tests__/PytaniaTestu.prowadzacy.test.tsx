import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ID_TESTU, pytania } from "./atrapy";

/**
 * Ten sam ekran w panelu prowadzącego: pełne działanie na trasach
 * prowadzącego (`/instructor/…`), te same funkcje co w administracji — lista
 * z pełną treścią i odpowiedzią poprawną, dodawanie i edycja w oknie
 * formularza, usunięcie z potwierdzeniem, kolejność strzałkami. Test obcego
 * kursu serwer pokazuje jak nieistniejący (404), więc ekran mówi wtedy
 * „Nie znaleziono testu”. Wspólny ekran odmowy zostaje tylko dla roli, której
 * serwer nie wpuszcza (403).
 *
 * Atrapa stoi na funkcji `api` klienta, więc funkcje danych ekranu wykonują
 * się naprawdę, a próba czyta adres, metodę i ciało każdego żądania.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/prowadzacy/testy/10/pytania",
}));

interface Wywolanie {
  sciezka: string;
  metoda: string;
  cialo: unknown;
}

let wywolania: Wywolanie[] = [];
let rolaKonta = "instructor";
let odpowiedzListy: () => Promise<unknown> = () => Promise.resolve(pytania());

const api = vi.fn((sciezka: string, opcje?: { method?: string; body?: unknown }) => {
  if (sciezka === "/me") return Promise.resolve({ role: rolaKonta });
  const metoda = opcje?.method ?? "GET";
  wywolania.push({ sciezka, metoda, cialo: opcje?.body });
  if (metoda === "GET" && /\/tests\/\d+\/questions$/.test(sciezka)) return odpowiedzListy();
  if (metoda === "POST") {
    const cialo = opcje?.body as { body: string; answers: { body: string; is_correct: boolean }[] };
    return Promise.resolve({ id: 44, body: cialo.body, sequence_order: 4, answers: cialo.answers.map((odpowiedz, i) => ({ id: 240 + i, ...odpowiedz })) });
  }
  if (metoda === "PATCH") {
    const id = Number(sciezka.split("/").pop());
    const pytanie = pytania().find((element) => element.id === id)!;
    return Promise.resolve({ ...pytanie, ...(opcje?.body as object) });
  }
  if (metoda === "DELETE") return Promise.resolve({ id: Number(sciezka.split("/").pop()), deleted: true });
  return Promise.reject(new Error(`nieoczekiwane wywołanie: ${metoda} ${sciezka}`));
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: [string, { method?: string; body?: unknown }?]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PytaniaTestu } = await import("../PytaniaTestu");
const { planZamiany } = await import("../logika");

const PIERWSZE = "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?";

async function otworz(panel: "administracja" | "prowadzacy", idKursu: string | null = "2") {
  render(<PytaniaTestu idTestu={String(ID_TESTU)} panel={panel} idKursu={idKursu} />);
  await waitFor(() => expect(screen.queryByText("Wczytywanie pytań…")).toBeNull());
}

beforeEach(() => {
  wywolania = [];
  rolaKonta = "instructor";
  odpowiedzListy = () => Promise.resolve(pytania());
  push.mockReset();
});

describe.each([
  { panel: "administracja" as const, grupa: "/admin", obca: "/instructor/" },
  { panel: "prowadzacy" as const, grupa: "/instructor", obca: "/admin/" },
])("panel $panel — każde żądanie idzie trasą $grupa/…", ({ panel, grupa, obca }) => {
  it("lista: pełna treść, odpowiedzi z oznaczoną poprawną; jedno żądanie GET", async () => {
    await otworz(panel);
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 1" })).toBeInTheDocument();
    expect(screen.getByText(PIERWSZE)).toBeInTheDocument();
    expect(screen.getByText("Gdy zagrożone jest życie lub zdrowie")).toBeInTheDocument();
    expect(screen.getAllByText("Poprawna")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Edytuj pytanie 3" })).toBeEnabled();
    expect(wywolania).toEqual([{ sciezka: `${grupa}/tests/10/questions`, metoda: "GET", cialo: undefined }]);
  });

  it("dodanie w oknie formularza: POST z treścią i odpowiedziami", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(panel);
    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj pytanie" }));
    const okno = screen.getByRole("dialog", { name: "Nowe pytanie" });
    await uzytkownik.type(within(okno).getByLabelText(/^Treść pytania/), "Co dalej?");
    await uzytkownik.type(within(okno).getByLabelText(/^Odpowiedź 1/), "Tak");
    await uzytkownik.type(within(okno).getByLabelText(/^Odpowiedź 2/), "Nie");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz pytanie" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Dodano pytanie 4.");
    expect(wywolania.slice(1)).toEqual([
      {
        sciezka: `${grupa}/tests/10/questions`,
        metoda: "POST",
        cialo: {
          body: "Co dalej?",
          answers: [
            { body: "Tak", is_correct: true },
            { body: "Nie", is_correct: false },
          ],
        },
      },
    ]);
  });

  it("edycja w oknie formularza: PATCH pytania z treścią i całym zestawem odpowiedzi z identyfikatorami", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(panel);
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj pytanie 2" }));
    const okno = screen.getByRole("dialog", { name: "Edycja pytania 2" });
    await uzytkownik.click(within(okno).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 2" }));
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz pytanie" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zapisano zmiany w pytaniu 2.");
    expect(wywolania.slice(1)).toEqual([
      {
        sciezka: `${grupa}/questions/42`,
        metoda: "PATCH",
        cialo: {
          body: "Która postawa wspiera rozmowę, która nie ocenia?",
          answers: [
            { id: 220, body: "Uważne słuchanie i parafraza", is_correct: false },
            { id: 221, body: "Szybkie udzielanie rad", is_correct: true },
          ],
        },
      },
    ]);
  });

  it("usunięcie po potwierdzeniu we wspólnym oknie: DELETE pytania", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(panel);
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 2" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć pytanie 2?" });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń pytanie" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Usunięto pytanie 2.");
    expect(wywolania.slice(1)).toEqual([{ sciezka: `${grupa}/questions/42`, metoda: "DELETE", cialo: undefined }]);
  });

  it("kolejność strzałką po lewej: kolejne PATCH z samym numerem pozycji", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(panel);
    await uzytkownik.click(screen.getByRole("button", { name: `Przenieś „${PIERWSZE}” niżej` }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj pytanie 1" })).toBeEnabled());

    const plan = planZamiany(pytania(), 0, 1)!;
    expect(wywolania.slice(1)).toEqual(
      plan.kroki.map((krok) => ({ sciezka: `${grupa}/questions/${krok.idPytania}`, metoda: "PATCH", cialo: { sequence_order: krok.pozycja } })),
    );
  });

  it(`żadne żądanie nie idzie trasą drugiego panelu (${obca}…)`, async () => {
    const uzytkownik = userEvent.setup();
    await otworz(panel);
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 3" }));
    await uzytkownik.click(within(screen.getByRole("dialog", { name: "Usunąć pytanie 3?" })).getByRole("button", { name: "Usuń pytanie" }));
    await screen.findByRole("status");
    expect(wywolania.length).toBeGreaterThan(1);
    expect(wywolania.filter((wywolanie) => wywolanie.sciezka.startsWith(obca))).toEqual([]);
  });
});

describe("panel prowadzącego — stany", () => {
  it("okruszki i powrót prowadzą do kursów prowadzącego; okruszek „Kurs” do kursu z parametru adresu", async () => {
    await otworz("prowadzacy");
    expect(screen.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/prowadzacy/kursy");
    expect(screen.getByRole("link", { name: "Kurs" })).toHaveAttribute("href", "/prowadzacy/kursy/2");
  });

  it("test obcego kursu albo nieistniejący (404): „Nie znaleziono testu”, nie ekran odmowy; powrót do kursu", async () => {
    const uzytkownik = userEvent.setup();
    odpowiedzListy = () => Promise.reject(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }));
    await otworz("prowadzacy");

    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono testu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeNull();
    expect(screen.queryByText(/Ten ekran jest dla/)).toBeNull();
    expect(wywolania).toEqual([{ sciezka: "/instructor/tests/10/questions", metoda: "GET", cialo: undefined }]);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy/2");
  });

  it("rola, której serwer nie wpuszcza na trasy prowadzącego (403): wspólny ekran odmowy „dla prowadzących”", async () => {
    const uzytkownik = userEvent.setup();
    rolaKonta = "student";
    odpowiedzListy = () => Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    await otworz("prowadzacy", null);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText("Twoja rola: Student. Ten ekran jest dla prowadzących.")).toBeInTheDocument();
    expect(screen.getByText("Nie masz dostępu do tej sekcji.")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursów" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy");
  });

  it("odmowa w panelu administracji dalej mówi „dla administracji”", async () => {
    rolaKonta = "instructor";
    odpowiedzListy = () => Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "" }));
    await otworz("administracja", null);
    expect(await screen.findByText("Twoja rola: Psycholog prowadzący. Ten ekran jest dla administracji.")).toBeInTheDocument();
  });

  it("niepoprawny numer kursu w adresie jest pomijany", async () => {
    odpowiedzListy = () => Promise.resolve([]);
    await otworz("prowadzacy", "../admin");
    await screen.findByRole("heading", { level: 2, name: "Ten test nie ma jeszcze pytań" });
    expect(screen.queryByRole("link", { name: "Kurs" })).toBeNull();
  });
});
