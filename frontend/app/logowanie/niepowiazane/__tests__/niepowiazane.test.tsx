import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu `/logowanie/niepowiazane` — cel, dokąd `lib/api.ts`
 * przekierowuje ważną sesję Kont Niepodzielni, której `sub` nie jest jeszcze
 * powiązany z żadnym kontem PsychON (patrz `lib/__tests__/api-401-bez-petli.test.ts`).
 * Mierzy trzy rzeczy: wyjaśnienie po polsku jest na ekranie, wylogowanie
 * czyta adres Kont PRZED zakończeniem sesji aplikacji — ten sam wzorzec co
 * `/konto` i `PanelShell` — oraz że identyfikator konta
 * z koperty 401 `konto_niepowiazane` trafia na ekran TYLKO wtedy, gdy jest
 * w odpowiedzi, i nigdzie indziej przy jego braku.
 */

const endSession = vi.fn();
const checkAccountBinding = vi.fn();
const push = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: (...args: unknown[]) => endSession(...args),
    checkAccountBinding: (...args: unknown[]) => checkAccountBinding(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

const NiepowiazanePage = (await import("@/app/logowanie/niepowiazane/page")).default;
const { KONTO_BINDING_AWARIA, KONTO_BINDING_LIMIT_MS } = await import("@/lib/api");

const ADRES_WYLOGOWANIA = "https://konta.example.org/realms/niepodzielni/protocol/openid-connect/logout";
const SUB_Z_TOKENA = "88522d2e-aaaa-bbbb-cccc-111122223333";
const TEKST_Z_IDENTYFIKATOREM =
  "Twoje konto Niepodzielni nie jest jeszcze powiązane z PsychON. Przekaż administratorowi ten identyfikator:";

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  endSession.mockReset().mockResolvedValue(undefined);
  checkAccountBinding.mockReset().mockResolvedValue(null);
  push.mockReset();
  assign = vi.fn();
  prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, origin: "https://platforma.example.org" },
  });
});

afterEach(() => {
  if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
  vi.unstubAllGlobals();
});

describe("/logowanie/niepowiazane", () => {
  it("wyjaśnia po polsku, że konto nie jest powiązane z PsychON", () => {
    render(<NiepowiazanePage />);
    expect(screen.getByRole("heading")).toHaveTextContent("Konto nie jest jeszcze połączone");
    expect(screen.getByText(/powiązane z żadnym kontem w PsychON/i)).toBeInTheDocument();
  });

  it("wylogowanie czyta adres Kont, potem kończy sesję, potem wychodzi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ url: ADRES_WYLOGOWANIA }) })),
    );

    render(<NiepowiazanePage />);
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(ADRES_WYLOGOWANIA));
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("gdy adresu nie da się odczytać: sesja i tak się kończy, powrót na /logowanie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<NiepowiazanePage />);
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/logowanie");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("identyfikator konta z koperty 401", () => {
  let writeText: ReturnType<typeof vi.fn>;
  let prawdziwySchowek: PropertyDescriptor | undefined;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    prawdziwySchowek = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    if (prawdziwySchowek) Object.defineProperty(navigator, "clipboard", prawdziwySchowek);
  });

  it("K1: koperta z error.reason.sub → tekst i wypisany identyfikator", async () => {
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);

    await waitFor(() => expect(screen.getByText(TEKST_Z_IDENTYFIKATOREM)).toBeInTheDocument());
    expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument();
  });

  it("K7: nagłówek i komunikat mają rolę czytnika ekranu, przycisk ma dostępną nazwę", async () => {
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);

    // Nagłówek: rola `heading` (h1), zawsze w drzewie dostępności.
    expect(screen.getByRole("heading")).toHaveTextContent("Konto nie jest jeszcze połączone");

    // Komunikat z identyfikatorem: rola `alert` (Alert variant="error", patrz
    // components/ui/Alert.tsx) — czytnik ekranu ogłasza go bez interakcji.
    const komunikat = await screen.findByRole("alert");
    expect(komunikat).toHaveTextContent(TEKST_Z_IDENTYFIKATOREM);
    expect(komunikat).toHaveTextContent(SUB_Z_TOKENA);

    // Przycisk: nazwa dostępna wyliczona z treści węzła (algorytm accname),
    // dokładnie to, co czyta `getByRole("button", { name })` z testing-library.
    expect(screen.getByRole("button", { name: "Kopiuj" })).toBeInTheDocument();
  });

  it("K2: przycisk Kopiuj wkłada do schowka DOKŁADNIE tę samą wartość co wypisana", async () => {
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);
    const przycisk = await screen.findByRole("button", { name: "Kopiuj" });
    const wypisanaWartosc = screen.getByText(SUB_Z_TOKENA).textContent;

    await userEvent.click(przycisk);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(wypisanaWartosc);
    expect(writeText).toHaveBeenCalledWith(SUB_Z_TOKENA);
  });

  it("K3 (kontrola negatywna): 401 bez error.reason.sub (unauthenticated) → ekran dotychczasowy, bez ID i bez przycisku", async () => {
    checkAccountBinding.mockResolvedValue({ code: "unauthenticated" });

    render(<NiepowiazanePage />);

    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(TEKST_Z_IDENTYFIKATOREM)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kopiuj" })).not.toBeInTheDocument();
    expect(screen.getByText(/powiązane z żadnym kontem w PsychON/i)).toBeInTheDocument();
  });

  it("K4: identyfikator nie trafia do console.log/console.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);
    const przycisk = await screen.findByRole("button", { name: "Kopiuj" });
    await userEvent.click(przycisk);

    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

/**
 * Gdy `GET /me` PADNIE inaczej niż 401 (sieć, 500, przekroczony limit czasu —
 * już rozstrzygnięte na `checkAccountBinding()` w `lib/api.ts` na
 * `KONTO_BINDING_AWARIA`, patrz `lib/__tests__/konto-niepowiazane-sub.test.ts`
 * K1), ekran NIE ma pokazywać dotychczasowego tekstu o braku powiązania —
 * ten kłamałby o przyczynie. K2 i K3 są kontrolami negatywnymi: te same dwie
 * ścieżki 401 co wyżej, zachowanie bez zmian.
 */
describe("awaria zapytania /me", () => {
  const TEKST_AWARII = /nie udało się sprawdzić stanu twojego konta/i;

  it("K1: checkAccountBinding sygnalizuje awarię → komunikat o chwilowej awarii, NIE stary tekst o braku powiązania", async () => {
    checkAccountBinding.mockResolvedValue({ code: KONTO_BINDING_AWARIA });

    render(<NiepowiazanePage />);

    await waitFor(() => expect(screen.getByText(TEKST_AWARII)).toBeInTheDocument());
    expect(screen.queryByText(/powiązane z żadnym kontem w PsychON/i)).not.toBeInTheDocument();
    expect(screen.queryByText(TEKST_Z_IDENTYFIKATOREM)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /spróbuj ponownie/i })).toBeInTheDocument();
  });

  it("K2 (kontrola negatywna): 401 z error.reason.sub → zachowanie bez zmian, bez komunikatu o awarii", async () => {
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);

    await waitFor(() => expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument());
    expect(screen.queryByText(TEKST_AWARII)).not.toBeInTheDocument();
  });

  it("K3 (kontrola negatywna): 401 bez sub (unauthenticated) → zachowanie bez zmian, bez komunikatu o awarii", async () => {
    checkAccountBinding.mockResolvedValue({ code: "unauthenticated" });

    render(<NiepowiazanePage />);

    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(TEKST_AWARII)).not.toBeInTheDocument();
    expect(screen.getByText(/powiązane z żadnym kontem w PsychON/i)).toBeInTheDocument();
  });

  it("K4: ponowienie bez przeładowania strony — 1 zapytanie na wejście, 2 po jednym kliknięciu, sukces po ponowieniu pokazuje identyfikator", async () => {
    checkAccountBinding
      .mockResolvedValueOnce({ code: KONTO_BINDING_AWARIA })
      .mockResolvedValueOnce({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);
    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(1));

    const przycisk = await screen.findByRole("button", { name: /spróbuj ponownie/i });
    await userEvent.click(przycisk);

    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument());
  });

  it("K5: trwała awaria — liczba zapytań rośnie tylko z kliknięciami użytkownika, nie sama z siebie", async () => {
    checkAccountBinding.mockResolvedValue({ code: KONTO_BINDING_AWARIA });

    render(<NiepowiazanePage />);
    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(1));

    // Brak automatycznego ponawiania: sam upływ czasu nie dokłada zapytań.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);

    const przycisk = await screen.findByRole("button", { name: /spróbuj ponownie/i });
    await userEvent.click(przycisk);
    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(2));

    await userEvent.click(przycisk);
    await waitFor(() => expect(checkAccountBinding).toHaveBeenCalledTimes(3));
  });
});

/**
 * Własny limit czasu sprawdzenia konta. `fetch` nie ma żadnego limitu sam
 * z siebie, więc zapytanie, które NIGDY się nie rozstrzyga (słaby zasięg,
 * serwer bez odpowiedzi), zostawiłby ekran na komunikacie o braku
 * powiązania — nieprawdziwym, bo o powiązaniu nic wtedy nie wiemy.
 * Mierzone sztucznymi zegarami: stan PRZED upływem limitu i PO.
 */
describe("limit czasu sprawdzenia konta", () => {
  const TEKST_AWARII = /nie udało się sprawdzić stanu twojego konta/i;
  const TEKST_STARY = /powiązane z żadnym kontem w PsychON/i;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function przesun(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("L1: zapytanie, które nigdy nie odpowiada — przed limitem bez awarii, po limicie komunikat o awarii i przycisk", async () => {
    checkAccountBinding.mockReturnValue(new Promise(() => {}));

    render(<NiepowiazanePage />);

    await przesun(KONTO_BINDING_LIMIT_MS - 1_000);
    expect(screen.queryByText(TEKST_AWARII)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /spróbuj ponownie/i })).not.toBeInTheDocument();

    await przesun(2_000);
    expect(screen.getByText(TEKST_AWARII)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /spróbuj ponownie/i })).toBeInTheDocument();
    expect(screen.queryByText(TEKST_STARY)).not.toBeInTheDocument();
  });

  it("L2 (kontrola negatywna): odpowiedź wolniejsza niż zero, ale szybsza niż limit → identyfikator, BEZ awarii", async () => {
    checkAccountBinding.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA }), 2_000);
      }),
    );

    render(<NiepowiazanePage />);

    await przesun(1_000);
    expect(screen.queryByText(SUB_Z_TOKENA)).not.toBeInTheDocument();

    await przesun(1_500);
    expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument();

    await przesun(60_000);
    expect(screen.queryByText(TEKST_AWARII)).not.toBeInTheDocument();
    expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument();
  });

  it("L3: zapytanie jest PRZERYWANE — po limicie sygnał jest odwołany, a spóźniona odpowiedź nie nadpisuje ekranu", async () => {
    checkAccountBinding.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA }),
            KONTO_BINDING_LIMIT_MS + 5_000,
          );
        }),
    );

    render(<NiepowiazanePage />);
    await przesun(KONTO_BINDING_LIMIT_MS + 1_000);

    expect(screen.getByText(TEKST_AWARII)).toBeInTheDocument();
    const sygnal = checkAccountBinding.mock.calls[0]?.[0] as AbortSignal;
    expect(sygnal.aborted).toBe(true);

    // Spóźniona odpowiedź wraca po limicie: ekran ma zostać przy awarii.
    await przesun(30_000);
    expect(screen.getByText(TEKST_AWARII)).toBeInTheDocument();
    expect(screen.queryByText(SUB_Z_TOKENA)).not.toBeInTheDocument();
  });

  it("L4: ponowienie po limicie — nowe zapytanie, udana odpowiedź pokazuje identyfikator", async () => {
    checkAccountBinding
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });

    render(<NiepowiazanePage />);
    await przesun(KONTO_BINDING_LIMIT_MS + 1_000);
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /spróbuj ponownie/i }));
    await przesun(0);

    expect(checkAccountBinding).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SUB_Z_TOKENA)).toBeInTheDocument();
  });

  it("L5: trwała awaria — przesunięcie zegara o 60 s nie dokłada ANI JEDNEGO zapytania", async () => {
    checkAccountBinding.mockReturnValue(new Promise(() => {}));

    render(<NiepowiazanePage />);
    await przesun(KONTO_BINDING_LIMIT_MS + 1_000);
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);

    await przesun(60_000);
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);
    expect(screen.getByText(TEKST_AWARII)).toBeInTheDocument();
  });
});
