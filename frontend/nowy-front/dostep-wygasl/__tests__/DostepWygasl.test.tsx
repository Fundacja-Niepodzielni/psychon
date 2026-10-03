import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";
import { DostepWygasl } from "../DostepWygasl";

let straznik: ReturnType<typeof straznikHostow>;
beforeEach(() => {
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("dostęp wygasł", () => {
  it("nagłówek, etykieta stanu, wyjaśnienie i jeden h1", () => {
    const { container } = render(<DostepWygasl logo={<span role="img" aria-label="Fundacja Niepodzielni" />} />);
    expect(screen.getByRole("heading", { level: 1, name: "Twój dostęp do platformy wygasł" })).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByText("Konto nieaktywne")).toBeTruthy();
    expect(screen.getByText(/Sześciomiesięczny okres dostępu do programu dobiegł końca/)).toBeTruthy();
    expect(screen.getByText(/przedłużymy Twój dostęp/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Fundacja Niepodzielni" })).toBeTruthy();
  });

  it("w treści dokładnie jeden odnośnik — kontakt mailowy — i żadnych przycisków", () => {
    render(<DostepWygasl />);
    const tresc = screen.getByRole("main");
    const linki = within(tresc).getAllByRole("link");
    expect(linki).toHaveLength(1);
    expect(linki[0].getAttribute("href")).toBe("mailto:kontakt@niepodzielni.com");
    expect(linki[0].textContent).toBe("kontakt@niepodzielni.com");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("stopka niesie odnośniki stron publicznych", () => {
    render(<DostepWygasl />);
    expect(within(screen.getByRole("navigation")).getAllByRole("link")).toHaveLength(4);
  });
});
