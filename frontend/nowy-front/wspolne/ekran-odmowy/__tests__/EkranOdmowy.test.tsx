import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@/lib/api/klient", () => ({ api: (...argumenty: unknown[]) => api(...argumenty) }));

const { EkranOdmowy, ZDANIA_ODMOWY, naglowekOdmowy } = await import("../EkranOdmowy");

const KONTO = { id: 5, first_name: "Marta", last_name: "Zielińska", email: "marta@demo.pl", role: "volunteer" };

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(KONTO);
});

function ekran(rodzaj: "brak-dostepu" | "nie-znaleziono" | "dostep-wygasl" = "brak-dostepu", onClick = vi.fn()) {
  return render(<EkranOdmowy rodzaj={rodzaj} czego="lekcji" coDalej="Wybierz inną stronę z pulpitu." przycisk={{ onClick }} />);
}

describe("EkranOdmowy — wspólny wzór odmowy, „nie znaleziono” i wygasłego dostępu", () => {
  it("trzy części: nagłówek o tym, co się stało, zdanie o roli zalogowanej osoby i jeden przycisk", async () => {
    ekran("brak-dostepu");

    expect(screen.getByRole("heading", { level: 1, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText("Jesteś zalogowany jako Wolontariusz.")).toBeInTheDocument();
    expect(screen.getByText("Wybierz inną stronę z pulpitu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do pulpitu" })).toBeInTheDocument();
  });

  it("zdanie „Ten ekran jest dla …” tylko wtedy, gdy ekran zna rolę docelową", async () => {
    const bez = ekran("brak-dostepu");
    await screen.findByText("Jesteś zalogowany jako Wolontariusz.");
    expect(bez.container.textContent).not.toContain("Ten ekran jest dla");
    bez.unmount();

    render(<EkranOdmowy rodzaj="brak-dostepu" rolaDocelowa="administracji" przycisk={{ onClick: () => {} }} />);
    expect(await screen.findByText("Jesteś zalogowany jako Wolontariusz. Ten ekran jest dla administracji.")).toBeInTheDocument();
  });

  it("przycisk podany przez ekran zastępuje napis domyślny, nadal jest jeden", async () => {
    const { container } = render(
      <EkranOdmowy rodzaj="nie-znaleziono" czego="kursu" przycisk={{ etykieta: "Wróć do listy", onClick: () => {} }} />,
    );
    await screen.findByText(/Jesteś zalogowany/);

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Wróć do listy" })).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("dokładnie jeden przycisk i brak odnośników", async () => {
    const onClick = vi.fn();
    const { container } = ekran("brak-dostepu", onClick);
    await screen.findByText(/Jesteś zalogowany jako/);

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fokus po wejściu stoi na nagłówku", async () => {
    ekran("dostep-wygasl");

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Twój dostęp wygasł." })).toHaveFocus());
  });

  it("poziom nagłówka według ekranu", () => {
    render(<EkranOdmowy rodzaj="nie-znaleziono" stopien={2} przycisk={{ etykieta: "Wróć", onClick: () => {} }} />);

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono strony" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("treść nie niesie kodów technicznych, numerów statusu ani adresu e-mail", async () => {
    for (const rodzaj of ["brak-dostepu", "nie-znaleziono", "dostep-wygasl"] as const) {
      const { container, unmount } = ekran(rodzaj);
      await screen.findByText(/Jesteś zalogowany jako/);
      const tresc = container.textContent ?? "";
      expect(tresc).not.toMatch(/\b(401|403|404|410|422|500)\b/);
      expect(tresc).not.toMatch(/forbidden|not_found|access_expired|unauthenticated|error/i);
      expect(tresc).not.toContain("@");
      unmount();
    }
  });

  it("„nie znaleziono” daje tę samą treść dla zasobu nieistniejącego i cudzego", async () => {
    const pierwszy = ekran("nie-znaleziono");
    await screen.findByText(/Jesteś zalogowany jako/);
    const dlaNieistniejacego = pierwszy.container.innerHTML.replace(/id="[^"]*"/g, "").replace(/aria-labelledby="[^"]*"/g, "");
    pierwszy.unmount();

    const drugi = ekran("nie-znaleziono");
    await screen.findByText(/Jesteś zalogowany jako/);
    const dlaCudzego = drugi.container.innerHTML.replace(/id="[^"]*"/g, "").replace(/aria-labelledby="[^"]*"/g, "");

    expect(dlaCudzego).toBe(dlaNieistniejacego);
    expect(dlaCudzego).toContain("Nie znaleziono lekcji");
  });

  it("nagłówki „co się stało” dla trzech rodzajów; „nie znaleziono” niesie nazwę rzeczy od ekranu", () => {
    expect(ZDANIA_ODMOWY).toEqual({
      "brak-dostepu": "Nie masz dostępu do tego ekranu",
      "nie-znaleziono": "Nie znaleziono {czego}",
      "dostep-wygasl": "Twój dostęp wygasł.",
    });
    expect(naglowekOdmowy("nie-znaleziono", "kursu")).toBe("Nie znaleziono kursu");
    expect(naglowekOdmowy("nie-znaleziono")).toBe("Nie znaleziono strony");
  });

  it("odczyt konta pyta o `/me` i nie pokazuje adresu e-mail", async () => {
    ekran("brak-dostepu");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/me"));
    await screen.findByText(/Jesteś zalogowany jako/);

    expect(document.body.textContent).not.toContain("marta@demo.pl");
  });

  it("rola prowadzącego w zdaniu; bez konta: bez zdania o osobie, reszta cała", async () => {
    api.mockResolvedValue({ role: "instructor" });
    const pierwszy = ekran();
    expect(await screen.findByText("Jesteś zalogowany jako Psycholog prowadzący.")).toBeInTheDocument();
    pierwszy.unmount();

    api.mockRejectedValue(new Error("sieć"));
    ekran();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Jesteś zalogowany/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do pulpitu" })).toBeInTheDocument();
  });

  it("axe: brak naruszeń", async () => {
    const { container } = ekran("brak-dostepu");
    await screen.findByText(/Jesteś zalogowany jako/);

    const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
