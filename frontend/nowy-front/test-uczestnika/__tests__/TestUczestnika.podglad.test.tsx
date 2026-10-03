import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, PYTANIA, SLUG, test as daneTestu } from "./atrapy";

/**
 * Tryb podglądu (personel albo prowadzący z parametrem podglądu): pas nad
 * ekranem, pytania można przejrzeć, ale odpowiedzi nie są wysyłane, a
 * odnośniki niosą parametr podglądu.
 */

const pobierzTest = vi.fn();
const wyslijPodejscie = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("podglad=1"),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzTest: (...args: unknown[]) => pobierzTest(...args),
  pobierzKursTestu: async () => KURS,
  pobierzHistorie: async () => [],
  wyslijPodejscie: (...args: unknown[]) => wyslijPodejscie(...args),
}));

const { TestUczestnika } = await import("../TestUczestnika");

function przyciskGlowny() {
  const lista = screen.getAllByRole("button").filter((b) => b.className.split(/\s+/).some((k) => /(^|_)primary(_|$)/.test(k)));
  expect(lista).toHaveLength(1);
  return lista[0];
}

beforeEach(() => {
  pobierzTest.mockReset().mockResolvedValue(daneTestu());
  wyslijPodejscie.mockReset();
});

describe("tryb podglądu", () => {
  it("pas podglądu z powrotem do edycji kursu i odnośnik do kursu z parametrem podglądu", async () => {
    render(<TestUczestnika slug={SLUG} podglad rola="project_manager" />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Tryb podglądu" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
    expect(screen.getByRole("link", { name: /^Wróć do kursu: / })).toHaveAttribute("href", `/panel/kursy/${SLUG}?podglad=1`);
  });

  it("pytania można przejrzeć, ale „Zakończ i sprawdź” jest nieczynny ze zdaniem i niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    render(<TestUczestnika slug={SLUG} podglad rola="instructor" />);
    await screen.findByRole("heading", { level: 2, name: "Zanim zaczniesz" });
    await uzytkownik.click(przyciskGlowny());
    for (const [indeks, pytanie] of PYTANIA.entries()) {
      await uzytkownik.click(screen.getByRole("radio", { name: pytanie.answers[1].body }));
      if (indeks < PYTANIA.length - 1) await uzytkownik.click(przyciskGlowny());
    }

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Zakończ i sprawdź");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("W trybie podglądu odpowiedzi nie są wysyłane.");
    await uzytkownik.click(przycisk);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(wyslijPodejscie).not.toHaveBeenCalled();
  });

  it("bez roli personelu albo prowadzącego ekran jest zwykły, bez pasa", async () => {
    render(<TestUczestnika slug={SLUG} podglad rola="volunteer" />);
    await screen.findByRole("heading", { level: 2, name: "Zanim zaczniesz" });
    expect(screen.queryByRole("region", { name: "Tryb podglądu" })).toBeNull();
  });
});
