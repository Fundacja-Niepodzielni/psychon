import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek EKRANU `/logowanie` — co użytkowniczka CZYTA, gdy logowanie się nie udaje.
 *
 * Kryterium jest z karty, nie z implementacji: przy 429 na ekranie ma stanąć
 * komunikat o zbyt wielu próbach (ten, który przysłał serwer, z czasem oczekiwania),
 * a przy 422 — błędy PRZY POLACH, których dotyczą. Dlatego każda asercja pyta
 * o SŁOWA i o powiązanie z polem (`aria-describedby`), a nie o kod HTTP: kod jest
 * po stronie serwera i ma tam własnych świadków, ekran mierzy się zdaniem, które
 * pokazuje.
 *
 * Regresja, którą to zatrzymuje (odbiór 06.09): oba przypadki kończyły się
 * jednym zastępczym „Nieprawidłowy e-mail lub hasło." — formalnie „obsłużone",
 * a dla czytającej bezużyteczne, bo nie mówi ani ile czekać, ani które pole poprawić.
 *
 * Dlaczego atrapa `signIn`: przedmiotem pomiaru jest EKRAN. Odpowiedź serwera
 * dociera tu tak samo, jak w produkcji — jako `code` z `CredentialsSignin`, czyli
 * zserializowana koperta błędu (patrz komentarz przy `LoginErrorPayload` na stronie).
 */

const signIn = vi.fn();
const getSession = vi.fn();
const push = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

const LoginPage = (await import("@/app/logowanie/page")).default;

/** Koperta błędu backendu w tej postaci, w jakiej realnie dochodzi do strony. */
function odpowiedzBledu(body: {
  status: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
}) {
  return { error: "CredentialsSignin", code: JSON.stringify(body), ok: false, status: 401 };
}

async function wyslijFormularz() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Adres e-mail"), "anna@example.org");
  await user.type(screen.getByLabelText("Hasło"), "tajne-haslo");
  await user.click(screen.getByRole("button", { name: /zaloguj/i }));
}

beforeEach(() => {
  signIn.mockReset();
  getSession.mockReset();
  push.mockReset();
});

describe("/logowanie — 429, zbyt wiele prób", () => {
  const KOMUNIKAT = "Zbyt wiele prób logowania. Spróbuj ponownie za 47 sekund.";

  it("pokazuje zdanie o zbyt wielu próbach razem z czasem oczekiwania", async () => {
    signIn.mockResolvedValue(
      odpowiedzBledu({ status: 429, code: "too_many_requests", message: KOMUNIKAT }),
    );

    render(<LoginPage />);
    await wyslijFormularz();

    // Alert błędu, a nie dowolny tekst gdziekolwiek: komunikat ma być ogłoszony
    // czytnikowi ekranu (`role="alert"`), nie tylko narysowany.
    expect(await screen.findByRole("alert")).toHaveTextContent(KOMUNIKAT);
  });

  it("NIE zamienia go na zastępcze „Nieprawidłowy e-mail lub hasło.”", async () => {
    // To jest cała treść regresji: przy limicie prób hasło może być poprawne,
    // a zdanie o haśle wysyła użytkowniczkę w złą stronę (będzie próbować dalej,
    // czyli dokładnie tego, co limit ma powstrzymać).
    signIn.mockResolvedValue(
      odpowiedzBledu({ status: 429, code: "too_many_requests", message: KOMUNIKAT }),
    );

    render(<LoginPage />);
    await wyslijFormularz();
    await screen.findByRole("alert");

    expect(screen.queryByText(/Nieprawidłowy e-mail lub hasło/)).not.toBeInTheDocument();
  });

  it("nie przepuszcza dalej — żadnego przekierowania po nieudanej próbie", async () => {
    signIn.mockResolvedValue(
      odpowiedzBledu({ status: 429, code: "too_many_requests", message: KOMUNIKAT }),
    );

    render(<LoginPage />);
    await wyslijFormularz();
    await screen.findByRole("alert");

    expect(push).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("/logowanie — 422, błędy pól", () => {
  const KOPERTA = {
    status: 422,
    code: "validation_error",
    message: "Popraw zaznaczone pola.",
    errors: {
      email: ["Podaj poprawny adres e-mail."],
      password: ["Hasło musi mieć co najmniej 8 znaków."],
    },
  };

  it("pokazuje komunikat KAŻDEGO pola przy tym polu, którego dotyczy", async () => {
    signIn.mockResolvedValue(odpowiedzBledu(KOPERTA));

    render(<LoginPage />);
    await wyslijFormularz();

    const email = await screen.findByLabelText("Adres e-mail");
    const haslo = screen.getByLabelText("Hasło");

    // `toHaveAccessibleDescription` sprawdza powiązanie przez `aria-describedby`,
    // czyli że komunikat jest PRZY polu, a nie luzem na stronie. Sam
    // `getByText` byłby zielony także wtedy, gdyby oba zdania wylądowały
    // w jednym worku na górze formularza — a wtedy nie wiadomo, co poprawiać.
    expect(email).toHaveAccessibleDescription("Podaj poprawny adres e-mail.");
    expect(haslo).toHaveAccessibleDescription("Hasło musi mieć co najmniej 8 znaków.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(haslo).toHaveAttribute("aria-invalid", "true");
  });

  it("nie miesza komunikatów pól — błąd hasła nie ląduje przy e-mailu", async () => {
    // KONTROLA NEGATYWNA przypisania: 422 tylko o haśle zostawia pole e-mail czyste.
    signIn.mockResolvedValue(
      odpowiedzBledu({
        status: 422,
        code: "validation_error",
        message: "Popraw zaznaczone pola.",
        errors: { password: ["Hasło musi mieć co najmniej 8 znaków."] },
      }),
    );

    render(<LoginPage />);
    await wyslijFormularz();

    await screen.findByText("Hasło musi mieć co najmniej 8 znaków.");
    const email = screen.getByLabelText("Adres e-mail");
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).toHaveAccessibleDescription("");
  });

  it("obok błędów pól pokazuje zdanie zbiorcze serwera", async () => {
    signIn.mockResolvedValue(odpowiedzBledu(KOPERTA));

    render(<LoginPage />);
    await wyslijFormularz();

    expect(await screen.findByRole("alert")).toHaveTextContent("Popraw zaznaczone pola.");
  });
});

describe("/logowanie — kontrole negatywne", () => {
  it("przy 401 mówi o e-mailu lub haśle i NIE wymyśla błędów pól", async () => {
    // Granica świadka: nie każde niepowodzenie ma być gadatliwe. Przy złych
    // danych logowania ekran ma jedno zdanie i żadnych podświetlonych pól —
    // inaczej podpowiadałby, które z dwóch jest złe.
    signIn.mockResolvedValue(
      odpowiedzBledu({
        status: 401,
        code: "invalid_credentials",
        message: "Nie znaleziono użytkownika o tym adresie w bazie.",
      }),
    );

    render(<LoginPage />);
    await wyslijFormularz();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nieprawidłowy e-mail lub hasło.",
    );
    // Komunikat serwera z 401 nie trafia na ekran: mówi więcej, niż wolno
    // powiedzieć niezalogowanemu (czy konto o tym adresie w ogóle istnieje).
    expect(screen.queryByText(/Nie znaleziono użytkownika/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Adres e-mail")).not.toHaveAttribute("aria-invalid");
  });

  it("przed wysłaniem formularza nie ma żadnego alertu", async () => {
    // Bez tego wszystkie testy wyżej byłyby zielone także dla ekranu, który
    // pokazuje błąd zawsze.
    render(<LoginPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("udane logowanie nie pokazuje błędu i przenosi wg roli z sesji", async () => {
    signIn.mockResolvedValue({ error: undefined, ok: true, status: 200 });
    getSession.mockResolvedValue({ user: { roles: ["instructor"] } });

    render(<LoginPage />);
    await wyslijFormularz();

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/prowadzacy"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
