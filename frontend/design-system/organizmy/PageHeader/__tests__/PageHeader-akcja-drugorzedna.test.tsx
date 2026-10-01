import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "../PageHeader";
import { DostawcaRamki } from "../../../szablony/KontekstRamki";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Ekran" }];

describe("PageHeader — akcja drugorzędna nagłówka", () => {
  it("obok przycisku głównego: obie w jednym kontenerze akcji, drugorzędna (outline) przed główną (kolor), każda raz", async () => {
    const naImport = vi.fn();
    const naDodaj = vi.fn();
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Zgłoszenia rekrutacyjne"
          opis="Opis."
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Dodaj zgłoszenie", onKliknij: naDodaj }}
          akcjaDrugorzedna={{ etykieta: "Importuj z pliku CSV", onKliknij: naImport }}
        />
      </DostawcaRamki>,
    );

    const glowa = container.querySelector("[data-testid='pageheader-glowa']") as HTMLElement;
    const akcje = container.querySelector("[data-testid='pageheader-przycisk-glowny']") as HTMLElement;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(glowa).toContainElement(akcje);
    const przyciski = Array.from(akcje.querySelectorAll("button"));
    expect(przyciski.map((p) => p.textContent)).toEqual(["Importuj z pliku CSV", "Dodaj zgłoszenie"]);
    expect(przyciski[0].className).toMatch(/outline/);
    expect(przyciski[0].className).not.toMatch(/primary/);
    expect(przyciski[1].className).toMatch(/primary/);
    expect(akcje.className).toMatch(/akcjeDwie/);
    // Jedyny przycisk w kolorze na ekranie pozostaje jeden.
    expect(container.querySelectorAll("button[class*='primary']")).toHaveLength(1);

    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("button", { name: "Importuj z pliku CSV" }));
    expect(naImport).toHaveBeenCalledTimes(1);
    expect(naDodaj).not.toHaveBeenCalled();
    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj zgłoszenie" }));
    expect(naDodaj).toHaveBeenCalledTimes(1);
  });

  it("bez przycisku głównego: sama w kontenerze akcji w wierszu tytułu, bez znacznika przycisku głównego", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Uczestnicy programu"
          onPowrot={() => undefined}
          akcjaDrugorzedna={{ etykieta: "Pobierz tabelę (Excel)", onKliknij: () => undefined }}
        />
      </DostawcaRamki>,
    );

    const glowa = container.querySelector("[data-testid='pageheader-glowa']") as HTMLElement;
    const akcje = container.querySelector("[data-testid='pageheader-akcje']") as HTMLElement;
    expect(container.querySelector("[data-testid='pageheader-przycisk-glowny']")).toBeNull();
    expect(glowa).toContainElement(akcje);
    expect(akcje.querySelectorAll("button")).toHaveLength(1);
    expect(akcje.className).not.toMatch(/akcjeDwie/);
    expect(container.querySelectorAll("button[class*='primary']")).toHaveLength(0);
    // Tytuł i akcja w jednym wierszu nagłówka: akcja stoi po bloku tekstu.
    expect(glowa.firstElementChild?.nextElementSibling).toBe(akcje);
  });

  it("stany: wyłączona (disabled) i rozwinięta (aria-expanded) przechodzą na przycisk", () => {
    const { rerender } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Ekran"
          onPowrot={() => undefined}
          akcjaDrugorzedna={{ etykieta: "Akcja", onKliknij: () => undefined, wylaczona: true, rozwinieta: false }}
        />
      </DostawcaRamki>,
    );
    const przycisk = screen.getByRole("button", { name: "Akcja" });
    expect(przycisk).toBeDisabled();
    expect(przycisk.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Ekran"
          onPowrot={() => undefined}
          akcjaDrugorzedna={{ etykieta: "Akcja", onKliknij: () => undefined, rozwinieta: true }}
        />
      </DostawcaRamki>,
    );
    expect(screen.getByRole("button", { name: "Akcja" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Akcja" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("bez akcji drugorzędnej zachowanie jak dotąd: przycisk główny sam w kontenerze, bez dodatkowych klas i znaczników", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Ekran"
          opis="Opis."
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Zrób", onKliknij: () => undefined }}
        />
      </DostawcaRamki>,
    );
    const akcje = container.querySelector("[data-testid='pageheader-przycisk-glowny']") as HTMLElement;
    expect(akcje.getAttributeNames().sort()).toEqual(["class", "data-testid"]);
    expect(akcje.className.split(/\s+/)).toHaveLength(1);
    expect(akcje.className).toMatch(/akcje/);
    expect(akcje.className).not.toMatch(/akcjeDwie/);
    expect(akcje.children).toHaveLength(1);
    expect(akcje.firstElementChild?.tagName).toBe("BUTTON");
    expect(akcje.firstElementChild?.getAttributeNames().sort()).toEqual(["class"]);
    expect(container.querySelector("[data-testid='pageheader-akcje']")).toBeNull();
    expect(container.querySelector("[data-testid='pageheader-akcja-drugorzedna']")).toBeNull();
  });

  it("bez przycisku głównego i bez akcji drugorzędnej nagłówek nie dokłada obszaru akcji", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader okruszki={OKRUSZKI} tytul="Ekran" onPowrot={() => undefined} />
      </DostawcaRamki>,
    );
    expect(container.querySelector("[data-testid='pageheader-glowa']")).toBeNull();
    expect(container.querySelector("[data-testid='pageheader-akcje']")).toBeNull();
  });
});

describe("PageHeader — podtytuł jako tekst albo treść z wyróżnieniem", () => {
  it("string: jeden span w akapicie, tak jak dotąd", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader okruszki={OKRUSZKI} tytul="Ekran" opis="Zwykły opis." onPowrot={() => undefined} />
      </DostawcaRamki>,
    );
    const akapit = screen.getByText("Zwykły opis.").closest("p") as HTMLElement;
    expect(akapit.children).toHaveLength(1);
    expect(akapit.firstElementChild?.tagName).toBe("SPAN");
    expect(akapit.firstElementChild?.innerHTML).toBe("Zwykły opis.");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("treść z wyróżnieniem: fragment w <strong> w tym samym spanie, tekst podtytułu bez zmian", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Ekran"
          opis={
            <>
              Najstarsza sprawa czeka <strong>6 dni</strong>.
            </>
          }
          onPowrot={() => undefined}
        />
      </DostawcaRamki>,
    );
    const akapit = container.querySelector("header p") as HTMLElement;
    expect(akapit.textContent).toBe("Najstarsza sprawa czeka 6 dni.");
    expect(akapit.querySelector("span > strong")?.textContent).toBe("6 dni");
    expect(akapit.children).toHaveLength(1);
  });

  it("treść z wyróżnieniem i plakietka stanu: separator „·” między nimi jak przy stringu", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Ekran"
          opis={
            <>
              Opis <strong>6 dni</strong>
            </>
          }
          status={{ wariant: "ok", etykieta: "aktywny" }}
          onPowrot={() => undefined}
        />
      </DostawcaRamki>,
    );
    const akapit = container.querySelector("header p") as HTMLElement;
    expect(akapit.textContent).toBe("Opis 6 dni · aktywny");
  });
});
