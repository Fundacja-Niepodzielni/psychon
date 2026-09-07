import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek KONTRAKTU koperty błędu logowania — obie połowy naraz.
 *
 * Dlaczego istnieje osobno od świadka ekranu: tam atrapą jest `signIn`, a
 * kopertę buduje ręcznie sam test, w kształcie, jakiego ekran się spodziewa.
 * Strona NADAWCZA (`authorize` w `auth.ts`, która pakuje odpowiedź backendu
 * w `CredentialsSignin.code`) i strona ODBIORCZA (`parseLoginError` na
 * `/logowanie`) nigdy się w bramce nie spotykały. Można było zmienić sposób
 * pakowania koperty i suita zostawała zielona, a w przeglądarce przy 429
 * i 422 wracało zastępcze „Nieprawidłowy e-mail lub hasło." — dokładnie ta
 * regresja, którą złapał odbiór żywy.
 *
 * Tutaj nic nie jest przepisane ręcznie między połowami: atrapą jest
 * BACKEND (`fetch`) i sam transport Auth.js, a wszystko pomiędzy —
 * `authorize` z `auth.ts`, klasa błędu, ekran `/logowanie` wraz z jego
 * własnym rozpakowaniem koperty — jest kodem, który jedzie na produkcję.
 *
 * Kryterium jest z karty, nie z implementacji: przy 429 użytkowniczka czyta
 * zdanie serwera z czasem oczekiwania, przy 422 — komunikaty przy polach.
 * Test nie mówi, JAK koperta ma być zapakowana; mówi, że to, co nadaje
 * serwer, dociera do oczu czytającej.
 */

/** Konfiguracja, którą `auth.ts` sam podaje do `NextAuth` — stąd bierzemy
 *  prawdziwe `providers[].authorize`, bez eksportu i bez zmiany produktu. */
const przechwycona = vi.hoisted(() => ({ config: null as unknown }));

/** Most udający transport Auth.js między `authorize` a ekranem. */
const most = vi.hoisted(() => ({
  zaloguj: null as null | ((dane: Record<string, unknown>) => Promise<unknown>),
}));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    przechwycona.config = config;
    return { handlers: {}, auth: () => null, signIn: () => undefined, signOut: () => undefined };
  },
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

const getSession = vi.fn();
const push = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: async (_provider: string, opcje: Record<string, unknown>) => {
    if (!most.zaloguj) throw new Error("most do authorize nie został zbudowany");
    return most.zaloguj(opcje);
  },
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

type Authorize = (credentials: Record<string, unknown>, request?: unknown) => Promise<unknown>;
interface DostawcaHaslem {
  id?: string;
  authorize?: Authorize;
  options?: { authorize?: Authorize };
}

await import("@/auth");
const config = przechwycona.config as { providers?: DostawcaHaslem[] } | null;
const dostawca = config?.providers?.find((p) => p.id === "credentials");
// Fabryka `Credentials` z Auth.js odkłada to, co podał `auth.ts`, do `options`
// (na wierzchu zostaje jej własna zaślepka `() => null`, którą Auth.js nadpisuje
// dopiero przy inicjalizacji). Bierzemy więc funkcję z `options` — to ta sama
// funkcja, którą framework później wywoła na produkcji.
const authorize = dostawca?.options?.authorize;
if (typeof authorize !== "function") {
  throw new Error("auth.ts nie oddał dostawcy `credentials` z własnym `authorize`");
}

/**
 * Odtwarza to, co Auth.js robi z wyjątkiem z `authorize`: nie pokazuje
 * użytkowniczce niczego poza `code` błędu `CredentialsSignin`. To jedyne
 * miejsce, w którym test cokolwiek zakłada o transporcie — i zakłada
 * dokładnie to, co opisuje komentarz przy `CredentialsLoginError`.
 */
most.zaloguj = async (dane) => {
  try {
    await authorize({ email: dane.email, password: dane.password });
    return { error: undefined, ok: true, status: 200 };
  } catch (e) {
    return {
      error: "CredentialsSignin",
      code: (e as { code?: unknown }).code,
      ok: false,
      status: 401,
    };
  }
};

const LoginPage = (await import("@/app/logowanie/page")).default;

const fetchAtrapa = vi.fn();

/** Odpowiedź backendu w kształcie z kontraktu API (§ koperta `error`). */
function odpowiedzBackendu(status: number, error: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: async () => ({ error }),
  } as unknown as Response;
}

async function wyslijFormularz() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Adres e-mail"), "anna@example.org");
  await user.type(screen.getByLabelText("Hasło"), "tajne-haslo");
  await user.click(screen.getByRole("button", { name: /zaloguj/i }));
}

beforeEach(() => {
  fetchAtrapa.mockReset();
  getSession.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchAtrapa);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("koperta błędu: od odpowiedzi backendu do zdania na ekranie", () => {
  const ZDANIE_429 = "Zbyt wiele prób logowania. Spróbuj ponownie za 47 sekund.";

  it("429 z backendu dociera na ekran jako zdanie serwera, nie jako zastępcze o haśle", async () => {
    fetchAtrapa.mockResolvedValue(
      odpowiedzBackendu(429, {
        status: 429,
        code: "too_many_requests",
        message: ZDANIE_429,
      }),
    );

    render(<LoginPage />);
    await wyslijFormularz();

    // Kontrola, że most naprawdę przeszedł przez `authorize` — inaczej test
    // byłby zielony także wtedy, gdyby nic po stronie serwera się nie wykonało.
    expect(fetchAtrapa).toHaveBeenCalledTimes(1);
    expect(String(fetchAtrapa.mock.calls[0][0])).toContain("/auth/login");

    expect(await screen.findByRole("alert")).toHaveTextContent(ZDANIE_429);
    expect(screen.queryByText(/Nieprawidłowy e-mail lub hasło/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("422 z backendu dociera na ekran jako komunikaty PRZY polach", async () => {
    fetchAtrapa.mockResolvedValue(
      odpowiedzBackendu(422, {
        status: 422,
        code: "validation_error",
        message: "Popraw zaznaczone pola.",
        errors: {
          email: ["Podaj poprawny adres e-mail."],
          password: ["Hasło musi mieć co najmniej 8 znaków."],
        },
      }),
    );

    render(<LoginPage />);
    await wyslijFormularz();

    const email = await screen.findByLabelText("Adres e-mail");
    const haslo = screen.getByLabelText("Hasło");

    expect(email).toHaveAccessibleDescription("Podaj poprawny adres e-mail.");
    expect(haslo).toHaveAccessibleDescription("Hasło musi mieć co najmniej 8 znaków.");
    expect(await screen.findByRole("alert")).toHaveTextContent("Popraw zaznaczone pola.");
  });

  it("awaria połączenia z backendem dociera jako zdanie o połączeniu", async () => {
    // Trzecia droga tej samej koperty: `authorize` buduje ją sam, bez odpowiedzi
    // serwera. Jeśli pakowanie koperty przestanie działać, ta droga też milknie.
    fetchAtrapa.mockRejectedValue(new Error("ECONNREFUSED"));

    render(<LoginPage />);
    await wyslijFormularz();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem",
    );
  });

  it("kontrola negatywna: udana odpowiedź backendu nie pokazuje żadnego błędu", async () => {
    // Bez tego wszystkie testy wyżej byłyby zielone także dla ekranu,
    // który pokazuje alert zawsze.
    fetchAtrapa.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { token: "sanctum-abc", user: { id: 7, role: "student" } } }),
    } as unknown as Response);
    getSession.mockResolvedValue({ user: { roles: ["student"] } });

    render(<LoginPage />);
    await wyslijFormularz();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
