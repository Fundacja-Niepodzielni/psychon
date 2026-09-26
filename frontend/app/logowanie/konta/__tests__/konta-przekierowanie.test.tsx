import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * `/logowanie/konta` było drugimi drzwiami logowania (konto Niepodzielni,
 * obok hasła lokalnego). PsychON jest teraz wyłącznie SSO — ta trasa zostaje
 * tylko jako przekierowanie dla starych linków, z zachowaniem `?error=`.
 */

const replace = vi.fn();
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));

// Ta sama kontrola co w świadku `panel/pulpit`: nagłówek ma POCHODZIĆ z
// `PageHeader`, nie tylko istnieć w drzewie — spy na komponencie, nie na
// klasach ani strukturze DOM.
vi.mock("@/components/molecules/PageHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/molecules/PageHeader")>();
  return { ...actual, default: vi.fn(actual.default) };
});

const { default: PageHeader } = await import("@/components/molecules/PageHeader");
const AccountSystemLoginRedirect = (await import("@/app/logowanie/konta/page")).default;

beforeEach(() => {
  replace.mockReset();
  query = "";
  vi.mocked(PageHeader).mockClear();
});

describe("/logowanie/konta — przekierowanie na /logowanie", () => {
  it("bez ?error=: przekierowuje na samo /logowanie", async () => {
    render(<AccountSystemLoginRedirect />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/logowanie"));
  });

  it("z ?error=: zachowuje go w przekierowaniu", async () => {
    query = "error=OAuthCallbackError";
    render(<AccountSystemLoginRedirect />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/logowanie?error=OAuthCallbackError"),
    );
  });

  it("nie ma już linku logowania hasłem", () => {
    render(<AccountSystemLoginRedirect />);
    // Sprawdzamy sam pierwszy, synchroniczny render — usunięcie linku
    // logowania hasłem jest częścią JSX zwracanego od razu, nie skutkiem
    // efektu przekierowania (ten jest sprawdzany osobno przez waitFor wyżej).
    expect(screen.queryByText(/hasłem/i)).not.toBeInTheDocument();
  });

  it("nagłówek H1 pochodzi z PageHeader ('Przekierowuję…')", () => {
    render(<AccountSystemLoginRedirect />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Przekierowuję…" }),
    ).toBeInTheDocument();
    // Pozytywna noga: nie samo "nagłówek jest", tylko "TEN komponent go
    // wyrenderował" — ręcznie wpisany `<h1>` zostawiłby ten spy niewywołanym.
    expect(vi.mocked(PageHeader).mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Przekierowuję…",
    });
  });
});
