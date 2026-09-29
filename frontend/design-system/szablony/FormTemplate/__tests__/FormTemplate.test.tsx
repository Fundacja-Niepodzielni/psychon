import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FormTemplate } from "../FormTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

function znacznik(nazwa: string) {
  return <div data-testid={`sonda-${nazwa}`}>{nazwa}</div>;
}

function identyfikatoryObszarow(kontener: HTMLElement): string[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("[data-testid^='sonda-']")).map(
    (wezel) => wezel.dataset.testid!.replace("sonda-", ""),
  );
}

describe("FormTemplate", () => {
  it("wariant panel: naglowek, powiadomienie, tresc (§5, w.187)", () => {
    const { container } = render(
      <FormTemplate
        naglowek={znacznik("naglowek")}
        powiadomienie={znacznik("powiadomienie")}
        tresc={znacznik("tresc")}
      />,
    );
    expect(identyfikatoryObszarow(container)).toEqual(["naglowek", "powiadomienie", "tresc"]);
  });

  it("wariant publiczny: logo, tresc, drobny druk — bez naglowka panelu", () => {
    const { container } = render(
      <FormTemplate
        wariant="publiczny"
        logo={znacznik("logo")}
        tresc={znacznik("tresc")}
        drobnyDruk={znacznik("drobny-druk")}
      />,
    );
    expect(identyfikatoryObszarow(container)).toEqual(["logo", "tresc", "drobny-druk"]);
  });

  it("kolumna ma max-width 640px (wariant panel)", () => {
    const { container } = render(<FormTemplate naglowek={znacznik("naglowek")} tresc={znacznik("tresc")} />);
    const uklad = container.querySelector("[data-style-id='szablon-formularz']") as HTMLElement;
    expect(uklad).toBeTruthy();
  });
});

describe("FormTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <FormTemplate naglowek={znacznik("naglowek")} tresc={<div>Zwykła treść formularza.</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-formularz");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <FormTemplate naglowek={znacznik("naglowek")} tresc={<Skeleton wiersze={3} />} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-formularz");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <FormTemplate
        naglowek={znacznik("naglowek")}
        tresc={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się zapisać formularza.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-formularz");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <FormTemplate
        naglowek={znacznik("naglowek")}
        tresc={
          <Notice wariant="warn" tytul="Brak uprawnień">
            Ten widok wymaga innej roli.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-formularz");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <FormTemplate
        naglowek={znacznik("naglowek")}
        tresc={
          <EmptyState
            naglowek="Brak pól"
            tresc="Ten formularz nie ma jeszcze żadnych pól."
            przycisk={{ etykieta: "Odśwież", onClick: () => {} }}
          />
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-formularz");
  });
});
