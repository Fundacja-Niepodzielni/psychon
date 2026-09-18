import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek komórki „Szczegóły" dziennika działań (H20). Karta przedmiotu
 * opisywała stan, w którym ekran rejestru w ogóle nie renderował ładunku
 * zdarzenia (`details`) — dane docierały z zaplecza, ale żadna kolumna ich
 * nie pokazywała. Na tym klonie ten komponent i jego podpięcie do tabeli już
 * istnieją, więc test pina rzeczywiste, dziś zmierzone zachowanie (wartości
 * pola i wartości w podglądzie oraz po rozwinięciu), a nie tylko obecność
 * elementów.
 *
 * Punkt niedomknięty, zapisany wprost zamiast markowany jako mocniejszy niż
 * jest: jsdom nie liczy layoutu CSS, więc test dłuższej treści (patrz niżej)
 * może zmierzyć wyłącznie nazwę klasy odpowiedzialnej za ograniczenie
 * wysokości i przewijanie, nie faktyczny renderowany rozmiar kontenera.
 */

const { default: AuditDetailsCell } = await import("@/components/h20/AuditDetailsCell");

describe("AuditDetailsCell", () => {
  it("niepusty ładunek pokazuje nazwę pola i wartość w podglądzie oraz po rozwinięciu", async () => {
    const user = userEvent.setup();
    const details = { pole_testowe: "wartosc-zmyslona-42" };
    render(<AuditDetailsCell details={details} />);

    // Podgląd skrócony (element <code>) zawiera zwarty JSON z polem i wartością.
    const podglad = screen.getByTitle(/pole_testowe/);
    expect(podglad.textContent).toContain("pole_testowe");
    expect(podglad.textContent).toContain("wartosc-zmyslona-42");

    // Przed rozwinięciem nie ma jeszcze pełnej treści w <pre>.
    expect(screen.queryByText(/wartosc-zmyslona-42/, { selector: "pre" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Szczegóły" }));

    const pelnaTresc = screen.getByRole("button", { name: "Zwiń" })
      .closest(".max-w-xs")
      ?.querySelector("pre");
    expect(pelnaTresc).not.toBeNull();
    expect(pelnaTresc?.textContent).toContain("pole_testowe");
    expect(pelnaTresc?.textContent).toContain("wartosc-zmyslona-42");
  });

  it("pusty ładunek ({}) pokazuje jawny myślnik i nie zawiera napisów null/undefined", () => {
    const { container } = render(<AuditDetailsCell details={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null/i);
    expect(container.textContent).not.toMatch(/undefined/i);
  });

  it("ładunek null pokazuje ten sam jawny myślnik i nie zawiera napisów null/undefined", () => {
    const { container } = render(<AuditDetailsCell details={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null/i);
    expect(container.textContent).not.toMatch(/undefined/i);
  });

  it("pole dłuższe niż 2000 znaków renderuje się i ogranicza wysokość kontenera przewijaniem", async () => {
    const user = userEvent.setup();
    const dlugiTekst = "a".repeat(2500);
    render(<AuditDetailsCell details={{ dlugie_pole: dlugiTekst }} />);

    await user.click(screen.getByRole("button", { name: "Szczegóły" }));

    const pre = screen.getByRole("button", { name: "Zwiń" })
      .closest(".max-w-xs")
      ?.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain(dlugiTekst);

    // Zachowanie: jsdom nie liczy layoutu, więc scrollHeight/clientHeight nie
    // różnicują się same z siebie. Jedyny dostępny w jsdom pomiar to obecność
    // klasy ograniczającej wysokość i włączającej przewijanie — to jest
    // pomiar słabszy (nazwa klasy, nie faktyczny renderowany rozmiar), bo
    // jsdom nie wykonuje layoutu CSS. Zapisuję to wprost zamiast markować
    // asercję jako silniejszą, niż jest.
    expect(pre?.className).toMatch(/max-h-/);
    expect(pre?.className).toMatch(/overflow-auto/);
  });

  it("tablica obiektów w ładunku nie rzuca wyjątku i się renderuje", () => {
    const details = { lista: [{ a: 1 }, { b: 2 }] };
    expect(() => render(<AuditDetailsCell details={details} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Szczegóły" })).toBeInTheDocument();
  });

  it("tablica w tablicy w ładunku nie rzuca wyjątku i się renderuje", () => {
    const details = { zagniezdzone: [[1, 2], [3, 4]] };
    expect(() => render(<AuditDetailsCell details={details} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Szczegóły" })).toBeInTheDocument();
  });

  it("wartość null w środku struktury nie rzuca wyjątku i się renderuje", () => {
    const details = { zewnetrzne: { wewnetrzne: null } };
    expect(() => render(<AuditDetailsCell details={details} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Szczegóły" })).toBeInTheDocument();
  });

  it("cykliczne odwołanie (niedające się zserializować) nie rzuca wyjątku, pokazuje tekst zastępczy", async () => {
    const user = userEvent.setup();
    const cykliczny: Record<string, unknown> = { pole: "wartosc" };
    cykliczny.samoOdwolanie = cykliczny;

    expect(() => render(<AuditDetailsCell details={cykliczny} />)).not.toThrow();

    await user.click(screen.getByRole("button", { name: "Szczegóły" }));
    const pre = screen.getByRole("button", { name: "Zwiń" })
      .closest(".max-w-xs")
      ?.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe("Nie udało się odczytać treści ładunku.");
  });
});
