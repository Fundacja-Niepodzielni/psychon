import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek `/dostep-wygasl` — ekran statyczny (bez API, bez routera, bez
 * stanu). Mierzy WYŁĄCZNIE to, co użytkownik widzi i może zrobić: komunikat
 * o wygaśnięciu dostępu i jedyną dostępną akcję — kontakt mailowy. Celowo
 * nie sprawdza układu ani poziomu nagłówka karty (`Card` go nie ustawia na
 * tym ekranie — `title` nie jest przekazywany), żeby przeżyć przepięcie na
 * `PublicPageTemplate`.
 */

const AccessExpiredPage = (await import("@/app/dostep-wygasl/page")).default;

describe("/dostep-wygasl — komunikat o wygaśnięciu dostępu", () => {
  it("pokazuje dokładnie jeden nagłówek h1 z treścią o wygaśnięciu dostępu", () => {
    render(<AccessExpiredPage />);

    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent("Twój dostęp do platformy wygasł");
  });

  it("pokazuje etykietę stanu konta 'Konto nieaktywne'", () => {
    render(<AccessExpiredPage />);

    expect(screen.getByText("Konto nieaktywne")).toBeInTheDocument();
  });

  it("wyjaśnia sześciomiesięczny okres dostępu i możliwość przedłużenia przez kontakt", () => {
    render(<AccessExpiredPage />);

    expect(
      screen.getByText(
        /Sześciomiesięczny okres dostępu do programu dobiegł końca/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a przedłużymy Twój dostęp\.?$/),
    ).toBeInTheDocument();
  });

  it("udostępnia dokładnie jeden link — kontakt mailowy pod właściwym adresem — bez żadnych przycisków", () => {
    render(<AccessExpiredPage />);

    const linki = screen.getAllByRole("link");
    expect(linki).toHaveLength(1);
    expect(linki[0]).toHaveAttribute("href", "mailto:kontakt@niepodzielni.com");
    expect(linki[0]).toHaveTextContent("kontakt@niepodzielni.com");

    // Noga przecząca stoi obok twierdzącej (powyżej): nie samo "nie ma
    // przycisków", tylko w parze z "jest dokładnie jeden, poprawny link".
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("pokazuje logo fundacji jako obrazek z dostępną nazwą 'Fundacja Niepodzielni'", () => {
    render(<AccessExpiredPage />);

    expect(
      screen.getByRole("img", { name: "Fundacja Niepodzielni" }),
    ).toBeInTheDocument();
  });
});
