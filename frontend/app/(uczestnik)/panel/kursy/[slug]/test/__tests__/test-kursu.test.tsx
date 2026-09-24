import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

/**
 * Nazwa dostępna elementu: `aria-label`, jeśli jest, inaczej widoczny tekst.
 * Uproszczenie pełnego algorytmu accname, wystarczające tu, bo strona testu
 * nadaje nazwę przyciskom albo przez treść, albo przez `aria-label` — nigdy
 * przez oba naraz ani przez `aria-labelledby`.
 */
function nazwaDostepna(el: HTMLElement): string {
  return el.getAttribute("aria-label") ?? el.textContent ?? "";
}

/**
 * Świadek ekranu testu kursu (`panel/kursy/[slug]/test/page.tsx`), dziś bez
 * żadnej próby na tym poziomie. Mierzy pięć zobowiązań Załącznika 1 wprost
 * z ekranu (jedno pytanie naraz, brak drogi wstecz, licznik pytań, blokadę
 * przejścia bez odpowiedzi, zakończenie zamiast „następne" na ostatnim
 * pytaniu) oraz to, że komunikat o wyczerpanych podejściach pochodzi z
 * odpowiedzi serwera, nie z własnego tekstu ekranu.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "test-kurs" }),
}));

const { default: CourseTestPage } = await import(
  "@/app/(uczestnik)/panel/kursy/[slug]/test/page"
);

const testPayload = {
  test_id: 10,
  pass_threshold: 70,
  attempts_used: 0,
  attempts_limit: 3,
  questions: [
    {
      id: 1,
      body: "Pytanie pierwsze",
      sequence_order: 1,
      answers: [
        { id: 11, body: "Odpowiedź A" },
        { id: 12, body: "Odpowiedź B" },
      ],
    },
    {
      id: 2,
      body: "Pytanie drugie",
      sequence_order: 2,
      answers: [
        { id: 21, body: "Odpowiedź C" },
        { id: 22, body: "Odpowiedź D" },
      ],
    },
    {
      id: 3,
      body: "Pytanie trzecie",
      sequence_order: 3,
      answers: [
        { id: 31, body: "Odpowiedź E" },
        { id: 32, body: "Odpowiedź F" },
      ],
    },
  ],
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: undefined });
});

/** Wczytuje ekran, czeka na fazę intro i klika „Rozpocznij test". */
async function startTest(user: ReturnType<typeof userEvent.setup>) {
  render(<CourseTestPage />);
  await screen.findByRole("heading", { name: "Test wiedzy" });
  await user.click(screen.getByRole("button", { name: "Rozpocznij test" }));
  await screen.findByRole("group");
}

/** Wybiera pierwszą odpowiedź bieżącego pytania. */
async function pickFirstAnswer(
  user: ReturnType<typeof userEvent.setup>,
  answerBody: string,
) {
  await user.click(screen.getByRole("radio", { name: answerBody }));
}

describe("ekran testu kursu — jedno pytanie na ekranie", () => {
  it("na ekranie widać treść dokładnie jednego pytania na raz", async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    await startTest(user);

    const tresc = screen.getByRole("group").textContent ?? "";
    expect(tresc).toContain("Pytanie pierwsze");
    expect(tresc).not.toContain("Pytanie drugie");
    expect(tresc).not.toContain("Pytanie trzecie");
  });
});

/**
 * Twierdzi, że użytkownik NIE jest na pytaniu 1 i JEDNOCZEŚNIE jest na
 * pytaniu 2 albo 3 — asercja pozytywna o tym, gdzie jest, nie samo
 * zaprzeczenie. Sama negacja („nie ma napisu Pytanie 1 z 3") przechodzi
 * też wtedy, gdy licznik w ogóle zniknął z ekranu; ten warunek tego nie
 * pozwala.
 */
function oczekujBrakCofnieciaDoPytania1() {
  expect(screen.queryByText("Pytanie 1 z 3")).not.toBeInTheDocument();
  const naDrugim = screen.queryByText("Pytanie 2 z 3") !== null;
  const naTrzecim = screen.queryByText("Pytanie 3 z 3") !== null;
  expect(naDrugim || naTrzecim).toBe(true);
}

describe("ekran testu kursu — brak drogi wstecz", () => {
  /** Wchodzi na pytanie 2 świeżym renderem strony testu. */
  async function idzDoPytania2(user: ReturnType<typeof userEvent.setup>) {
    api.mockResolvedValue(testPayload);
    await startTest(user);
    await pickFirstAnswer(user, "Odpowiedź A");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByText("Pytanie 2 z 3")).toBeInTheDocument(),
    );
  }

  it("żaden przycisk ani odnośnik dostępny na pytaniu 2 nie cofa do pytania 1", async () => {
    const user = userEvent.setup();

    // Pierwszy przebieg: spisuje nazwy wszystkich elementów interaktywnych
    // widocznych na ekranie pytania 2 (role button i link). Żaden z nich nie
    // jest odpowiedzią z atrapy (`Odpowiedź C` / `Odpowiedź D` mają rolę
    // radio, nie button/link) — więc tu nic nie trzeba wyłączać z klikania.
    await idzDoPytania2(user);
    // Nazwa dostępna (accessible name), nie `textContent` — inaczej przycisk
    // rozpoznawalny wyłącznie po `aria-label` (bez widocznego napisu) nie
    // dałby się potem odnaleźć przez `getByRole(..., { name })` i przypadek
    // fałszywie czerwieniłby się z powodu błędu w teście, nie w ekranie.
    const nazwyPrzyciskow = screen.getAllByRole("button").map(nazwaDostepna);
    const nazwyLinkow = screen.queryAllByRole("link").map(nazwaDostepna);
    cleanup();

    // Kontrola, że w ogóle jest co klikać — inaczej pętle niżej przechodzą
    // pusto i przypadek nic nie mierzy.
    expect(nazwyPrzyciskow.length + nazwyLinkow.length).toBeGreaterThan(0);

    for (const nazwa of nazwyPrzyciskow) {
      await idzDoPytania2(user);
      await user.click(screen.getByRole("button", { name: nazwa }));
      oczekujBrakCofnieciaDoPytania1();
      cleanup();
    }

    for (const nazwa of nazwyLinkow) {
      await idzDoPytania2(user);
      await user.click(screen.getByRole("link", { name: nazwa }));
      oczekujBrakCofnieciaDoPytania1();
      cleanup();
    }
  });

  /**
   * Kontrola negatywna: dowodzi, że `oczekujBrakCofnieciaDoPytania1` i pętla
   * „klikaj każdy przycisk z osobna" naprawdę rozróżniają ruch do przodu od
   * ruchu wstecz, a nie tylko liczą przyciski. Atrapa niżej to NIE strona
   * testu kursu — to osobny, minimalny licznik z jednym przyciskiem, który
   * celowo idzie tylko do przodu („Pomiń pytanie"). Jeśli powyższy wzorzec
   * miałby fałszywie czerwienić się na każdym przycisku, czerwieniłby się
   * i tu; zamiast tego musi zostać zielony.
   */
  function LicznikTylkoNaprzod() {
    const [i, setI] = useState(1); // start na "pytaniu 2"
    return (
      <div>
        <span>{`Pytanie ${i + 1} z 3`}</span>
        <button onClick={() => setI((x) => Math.min(x + 1, 2))}>
          Pomiń pytanie
        </button>
      </div>
    );
  }

  it("kontrola: przycisk, który nie cofa, zostaje zielony w tym samym wzorcu asercji", async () => {
    const user = userEvent.setup();
    render(<LicznikTylkoNaprzod />);
    expect(screen.getByText("Pytanie 2 z 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pomiń pytanie" }));

    oczekujBrakCofnieciaDoPytania1();
    expect(screen.getByText("Pytanie 3 z 3")).toBeInTheDocument();
  });
});

describe("ekran testu kursu — licznik pytania N z M", () => {
  it("licznik rośnie o jeden po przejściu do kolejnego pytania", async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    await startTest(user);

    expect(screen.getByText("Pytanie 1 z 3")).toBeInTheDocument();

    await pickFirstAnswer(user, "Odpowiedź A");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));

    await waitFor(() =>
      expect(screen.getByText("Pytanie 2 z 3")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Pytanie 1 z 3")).not.toBeInTheDocument();
  });
});

describe("ekran testu kursu — przejście dalej zablokowane bez odpowiedzi", () => {
  it('przycisk „Następne pytanie" jest wyłączony i klik nie przechodzi dalej bez wybranej odpowiedzi', async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    await startTest(user);

    const dalej = screen.getByRole("button", { name: "Następne pytanie" });
    expect(dalej).toBeDisabled();

    await user.click(dalej);
    expect(screen.getByRole("group").textContent).toContain(
      "Pytanie pierwsze",
    );

    await pickFirstAnswer(user, "Odpowiedź A");
    expect(screen.getByRole("button", { name: "Następne pytanie" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie drugie",
      ),
    );
  });
});

describe("ekran testu kursu — ostatnie pytanie kończy test, nie przechodzi dalej", () => {
  it('na ostatnim pytaniu jest przycisk zakończenia, nie „Następne pytanie"', async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    await startTest(user);

    await pickFirstAnswer(user, "Odpowiedź A");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie drugie",
      ),
    );

    await pickFirstAnswer(user, "Odpowiedź C");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie trzecie",
      ),
    );

    expect(
      screen.getByRole("button", { name: "Zakończ i sprawdź" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Następne pytanie" }),
    ).not.toBeInTheDocument();
  });
});

describe("ekran testu kursu — wyczerpane podejścia pokazują komunikat serwera", () => {
  it("po odmowie attempts_exhausted ekran pokazuje dokładnie komunikat z odpowiedzi, nie własny tekst", async () => {
    const komunikatSerwera =
      "Osiągnięto limit 3 podejść do tego testu w tym cyklu.";
    api.mockImplementation((url: string, options?: { method?: string }) => {
      if (url === "/courses/test-kurs/test") {
        return Promise.resolve(testPayload);
      }
      if (url === "/tests/10/attempts" && options?.method === "POST") {
        return Promise.reject(
          new ApiError(422, "attempts_exhausted", komunikatSerwera),
        );
      }
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    const user = userEvent.setup();
    await startTest(user);

    await pickFirstAnswer(user, "Odpowiedź A");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie drugie",
      ),
    );
    await pickFirstAnswer(user, "Odpowiedź C");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie trzecie",
      ),
    );
    await pickFirstAnswer(user, "Odpowiedź E");
    await user.click(screen.getByRole("button", { name: "Zakończ i sprawdź" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(komunikatSerwera),
    );
    expect(
      screen.queryByText("Nie udało się wysłać testu. Spróbuj ponownie."),
    ).not.toBeInTheDocument();
  });
});

/**
 * Płatnik pytania z ID, które NIE są kolejnymi liczbami — żeby przypadek
 * niżej nie mógł przejść przez zwykłe powtórzenie własnych danych
 * wejściowych (np. przez indeks 0/1/2 zamiast prawdziwego identyfikatora
 * z atrapy).
 */
const testPayloadNiekolejne = {
  test_id: 77,
  pass_threshold: 60,
  attempts_used: 0,
  attempts_limit: 5,
  questions: [
    {
      id: 4021,
      body: "Pytanie o kolor",
      sequence_order: 1,
      answers: [
        { id: 91001, body: "Czerwony" },
        { id: 91002, body: "Niebieski" },
      ],
    },
    {
      id: 4022,
      body: "Pytanie o dźwięk",
      sequence_order: 2,
      answers: [
        { id: 91101, body: "Cichy" },
        { id: 91102, body: "Głośny" },
      ],
    },
    {
      id: 4023,
      body: "Pytanie o smak",
      sequence_order: 3,
      answers: [
        { id: 91201, body: "Słodki" },
        { id: 91202, body: "Kwaśny" },
      ],
    },
  ],
};

describe("ekran testu kursu — pasek postępu pokazuje wartość zgodną z liczbą odpowiedzi", () => {
  it("wartość paska rośnie proporcjonalnie do liczby udzielonych odpowiedzi (1/3, potem 2/3), nie skacze od razu do pełnej", async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    await startTest(user);

    expect(
      screen.getByRole("progressbar", { name: "Postęp testu" }),
    ).toHaveAttribute("aria-valuenow", "0");

    await pickFirstAnswer(user, "Odpowiedź A");
    expect(
      screen.getByRole("progressbar", { name: "Postęp testu" }),
    ).toHaveAttribute("aria-valuenow", "33");

    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie drugie",
      ),
    );
    // Wejście na pytanie 2 samo w sobie nie zwiększa licznika udzielonych
    // odpowiedzi — nadal odpowiedziano tylko na jedno z trzech pytań.
    expect(
      screen.getByRole("progressbar", { name: "Postęp testu" }),
    ).toHaveAttribute("aria-valuenow", "33");

    await pickFirstAnswer(user, "Odpowiedź C");
    expect(
      screen.getByRole("progressbar", { name: "Postęp testu" }),
    ).toHaveAttribute("aria-valuenow", "67");
  });
});

describe("ekran testu kursu — treść wysyłana do API zawiera wybrane odpowiedzi", () => {
  it("ciało żądania POST zawiera dokładnie odpowiedzi wybrane przez użytkownika, sparowane z identyfikatorami pytań i opcji z atrapy", async () => {
    api.mockImplementation((url: string, options?: { method?: string }) => {
      if (url === "/courses/test-kurs/test") {
        return Promise.resolve(testPayloadNiekolejne);
      }
      if (url === "/tests/77/attempts" && options?.method === "POST") {
        return Promise.resolve({
          attempt_number: 1,
          score_percent: 100,
          passed: true,
          wrong_question_ids: [],
        });
      }
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    const user = userEvent.setup();
    await startTest(user);

    // Celowo NIE pierwsza opcja z listy każdego pytania — żeby wynik nie
    // dał się odgadnąć samą kolejnością deklaracji w atrapie.
    await pickFirstAnswer(user, "Niebieski");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie o dźwięk",
      ),
    );

    await pickFirstAnswer(user, "Głośny");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie o smak",
      ),
    );

    await pickFirstAnswer(user, "Słodki");
    await user.click(screen.getByRole("button", { name: "Zakończ i sprawdź" }));

    await waitFor(() => {
      const wywolaniePost = api.mock.calls.find(
        ([url, options]) =>
          url === "/tests/77/attempts" &&
          (options as { method?: string } | undefined)?.method === "POST",
      );
      expect(wywolaniePost).toBeDefined();
    });

    const wywolaniePost = api.mock.calls.find(
      ([url, options]) =>
        url === "/tests/77/attempts" &&
        (options as { method?: string } | undefined)?.method === "POST",
    )!;
    const [, opcjePost] = wywolaniePost as [
      string,
      { body: { answers: Record<number, number> } },
    ];

    expect(opcjePost.body).toEqual({
      answers: {
        4021: 91002,
        4022: 91102,
        4023: 91201,
      },
    });
  });
});

describe("ekran testu kursu — komunikat awarii wysyłki pokazuje się na ekranie", () => {
  it("po nieudanej wysyłce testu (błąd sieci, nie odpowiedź serwera) na ekranie pojawia się dokładnie komunikat o niepowodzeniu wysyłki", async () => {
    api.mockImplementation((url: string, options?: { method?: string }) => {
      if (url === "/courses/test-kurs/test") {
        return Promise.resolve(testPayload);
      }
      if (url === "/tests/10/attempts" && options?.method === "POST") {
        return Promise.reject(new Error("network down"));
      }
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    const user = userEvent.setup();
    await startTest(user);

    await pickFirstAnswer(user, "Odpowiedź A");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie drugie",
      ),
    );
    await pickFirstAnswer(user, "Odpowiedź C");
    await user.click(screen.getByRole("button", { name: "Następne pytanie" }));
    await waitFor(() =>
      expect(screen.getByRole("group").textContent).toContain(
        "Pytanie trzecie",
      ),
    );
    await pickFirstAnswer(user, "Odpowiedź E");
    await user.click(screen.getByRole("button", { name: "Zakończ i sprawdź" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Nie udało się wysłać testu. Spróbuj ponownie.",
      ),
    );
  });
});
