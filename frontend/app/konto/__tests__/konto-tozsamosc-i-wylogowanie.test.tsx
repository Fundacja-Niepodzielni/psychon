import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek EKRANU „Twoje konto" (`/konto`) — dwa stany sprawdzone wcześniej
 * ręcznie, plus KOLEJNOŚĆ operacji przy wylogowaniu.
 *
 * 1. Tożsamość na ekranie pochodzi z odpowiedzi `GET /sso/whoami`, czyli z tokenu
 *    tej sesji — nie z lokalnej tabeli, nie z pamięci przeglądarki. Dlatego test
 *    podaje `sub` i role atrapą klienta API i wymaga ich DOKŁADNIE na ekranie.
 * 2. Gdy to wywołanie odpowiada 401, ekran pokazuje stan błędu i NIE pokazuje
 *    żadnej tożsamości. „Nie pokazuje" jest tu równie ważne jak „pokazuje":
 *    ekran, który przy 401 zostawia poprzednie dane, kłamie o tym, kto jest zalogowany.
 * 3. Wylogowanie odczytuje adres zakończenia sesji PRZED zakończeniem sesji.
 *    Ten adres niesie `id_token_hint` wzięty z ciasteczka tej sesji — po
 *    `endSession()` ciasteczka już nie ma, więc odwrócona kolejność daje adres
 *    bez wskazówki, a to znaczy: sesja w systemie kont zostaje żywa i kolejne
 *    wejście „logowaniem przez konto" przechodzi bez pytania o hasło.
 *    Kod ma w tym miejscu komentarz ostrzegawczy — komentarz nie jest świadkiem,
 *    bo nie pada, gdy ktoś zamieni dwie linie miejscami. Test poniżej pada.
 *
 * Atrapa klienta API zachowuje PRAWDZIWĄ klasę `ApiError` (`importOriginal`),
 * bo ekran rozpoznaje błąd przez `instanceof` — własna podróbka klasy mierzyłaby
 * zgodność testu z samym sobą.
 */

const fetchWhoAmI = vi.fn();
const endSession = vi.fn();
const push = vi.fn();

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchWhoAmI: (...args: unknown[]) => fetchWhoAmI(...args),
    endSession: (...args: unknown[]) => endSession(...args),
  };
});

const { ApiError } = await import("@/lib/api");
const AccountPage = (await import("@/app/konto/page")).default;

const ADRES_WYLOGOWANIA =
  "https://konta.example.org/realms/niepodzielni/protocol/openid-connect/logout";

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  fetchWhoAmI.mockReset();
  endSession.mockReset().mockResolvedValue(undefined);
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

describe("/konto — tożsamość z sesji", () => {
  it("pokazuje `sub` i role dokładnie takie, jakie przyszły z whoami", async () => {
    fetchWhoAmI.mockResolvedValue({
      sub: "f1d2c3b4-0000-4a5b-9c8d-7e6f5a4b3c2d",
      roles: ["instructor", "volunteer"],
    });

    render(<AccountPage />);

    expect(await screen.findByText("f1d2c3b4-0000-4a5b-9c8d-7e6f5a4b3c2d")).toBeInTheDocument();
    expect(screen.getByText("instructor")).toBeInTheDocument();
    expect(screen.getByText("volunteer")).toBeInTheDocument();
    // Ekran nie dokłada roli od siebie ani nie gubi żadnej z tokenu.
    expect(screen.queryByText("super_admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("konto bez ról nazywa ten stan wprost, zamiast pokazywać pustkę", async () => {
    // KONTROLA POZYTYWNA stanu granicznego: brak ról to poprawna odpowiedź,
    // a nie awaria — ekran ma to powiedzieć, żeby nie wyglądało na błąd wczytywania.
    fetchWhoAmI.mockResolvedValue({ sub: "sub-bez-rol", roles: [] });

    render(<AccountPage />);

    expect(await screen.findByText("sub-bez-rol")).toBeInTheDocument();
    expect(
      screen.getByText("Brak ról — to również jest poprawny stan."),
    ).toBeInTheDocument();
  });
});

describe("/konto — stan błędu przy 401", () => {
  it("pokazuje komunikat z kodem błędu i ŻADNEJ tożsamości", async () => {
    fetchWhoAmI.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "unauthenticated",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      }),
    );

    render(<AccountPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sesja wygasła. Zaloguj się ponownie.");
    expect(alert).toHaveTextContent("kod: unauthenticated");
    expect(screen.queryByText(/Identyfikator/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Role z tokenu/)).not.toBeInTheDocument();
  });

  it("po 401 nie zostaje ekran „Wczytywanie…”", async () => {
    // Bez tego stan błędu mógłby nigdy nie dojść do użytkowniczki: pierwszy
    // render też nie pokazuje tożsamości, więc test na samą jej nieobecność
    // byłby zielony dla ekranu, który wisi w nieskończoność.
    fetchWhoAmI.mockRejectedValue(
      new ApiError({ status: 401, code: "unauthenticated", message: "Sesja wygasła." }),
    );

    render(<AccountPage />);

    await screen.findByRole("alert");
    expect(screen.queryByText("Wczytywanie…")).not.toBeInTheDocument();
  });

  it("awaria sieci (nie ApiError) mówi o połączeniu, nie o sesji", async () => {
    // KONTROLA NEGATYWNA rozpoznania błędu: dwa różne powody, dwa różne zdania.
    fetchWhoAmI.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<AccountPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem.",
    );
  });
});

describe("/konto — wylogowanie czyta adres PRZED zakończeniem sesji", () => {
  /**
   * Atrapa trasy `/api/auth/end-session-url` zachowuje się jak prawdziwa: adres
   * z `id_token_hint` powstaje z ciasteczka sesji, więc gdy sesja jest już
   * zakończona, trasa nie ma z czego wziąć wskazówki i oddaje ekran logowania.
   * To dlatego ten test pada po zamianie kolejności, a nie tylko „wygląda inaczej".
   */
  function atrapaTrasy(stan: { sesjaZywa: boolean; kolejnosc: string[] }) {
    return vi.fn(async (url: string) => {
      stan.kolejnosc.push(`odczyt-adresu:${url}`);
      const adres = stan.sesjaZywa
        ? `${ADRES_WYLOGOWANIA}?id_token_hint=id-token-tej-sesji&post_logout_redirect_uri=https%3A%2F%2Fplatforma.example.org%2Fapi%2Fauth%2Fcallback%2Fkeycloak`
        : "/logowanie/konta";
      return { ok: true, json: async () => ({ url: adres }) };
    });
  }

  async function zalogujIWyloguj(stan: { sesjaZywa: boolean; kolejnosc: string[] }) {
    fetchWhoAmI.mockResolvedValue({ sub: "sub-123", roles: ["volunteer"] });
    endSession.mockImplementation(async () => {
      stan.kolejnosc.push("koniec-sesji");
      stan.sesjaZywa = false;
    });
    vi.stubGlobal("fetch", atrapaTrasy(stan));

    render(<AccountPage />);
    await screen.findByText("sub-123");
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));
  }

  it("wychodzi pod adres z `id_token_hint`, bo czyta go, gdy sesja jeszcze żyje", async () => {
    const stan = { sesjaZywa: true, kolejnosc: [] as string[] };
    await zalogujIWyloguj(stan);

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const adres = assign.mock.calls[0][0] as string;
    expect(adres).toContain("/protocol/openid-connect/logout");
    expect(adres).toContain("id_token_hint=id-token-tej-sesji");
    // Odwrócona kolejność dałaby tu ekran logowania zamiast adresu systemu kont —
    // czyli ciche pozostawienie żywej sesji po stronie systemu kont.
    expect(adres).not.toBe("/logowanie/konta");
  });

  it("kolejność jest dosłownie ta: najpierw odczyt adresu, potem koniec sesji, na końcu wyjście", async () => {
    const stan = { sesjaZywa: true, kolejnosc: [] as string[] };
    await zalogujIWyloguj(stan);

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(stan.kolejnosc).toEqual([
      "odczyt-adresu:/api/auth/end-session-url",
      "koniec-sesji",
    ]);
    // Wyjście na zewnątrz jest ostatnie: sesja aplikacji ma być już zamknięta,
    // zanim przeglądarka opuści stronę.
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("gdy adresu nie da się odczytać, sesja i tak się kończy, a ekran wraca do logowania", async () => {
    // KONTROLA NEGATYWNA: awaria odczytu adresu nie może zostawić użytkowniczki
    // zalogowanej w aplikacji. Wyjście z realmu przepada, sesja lokalna nie.
    fetchWhoAmI.mockResolvedValue({ sub: "sub-123", roles: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<AccountPage />);
    await screen.findByText("sub-123");
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/logowanie/konta");
    expect(assign).not.toHaveBeenCalled();
  });
});
