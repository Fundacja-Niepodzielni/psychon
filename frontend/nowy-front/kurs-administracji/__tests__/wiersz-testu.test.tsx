import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Wiersz testu końcowego w karcie „Tematy i lekcje”, w obu rolach ekranu
 * kursu: administracja (`/admin/…`) i przypisany prowadzący (`/instructor/…`).
 * Ten sam komponent w tym samym miejscu. Atrapa stoi na funkcjach `api`
 * klienta, więc próba czyta adres, metodę i ciało każdego żądania.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

let serwer: AtrapaSerwera;
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

const { KursAdministracji } = await import("../KursAdministracji");
const { ApiError } = await import("@/lib/api/klient");

const ROLE = [
  { rola: "admin", grupa: "admin", obca: "instructor", pytania: "/admin/testy/31/pytania?kurs=4" },
  { rola: "instructor", grupa: "instructor", obca: "admin", pytania: "/prowadzacy/testy/31/pytania?kurs=4" },
] as const;

/** Test założony przez serwer: progi edycji (80 %, 3 podejścia). */
const ZALOZONY = {
  id: 31,
  course_id: 4,
  pass_threshold: null,
  attempts_limit: null,
  question_count: 10,
  effective_pass_threshold: 80,
  effective_attempts_limit: 3,
};

beforeEach(() => {
  back.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

describe.each(ROLE)("wiersz testu końcowego — rola $rola", ({ rola, grupa, obca, pytania }) => {
  const TESTY_KURSU = `/${grupa}/courses/4/tests`;
  const ZAPIS_TESTU = `/${grupa}/tests/31`;

  async function renderEkranu() {
    const wynik = render(<KursAdministracji idKursu="4" rola={rola} />);
    await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });
    await waitFor(() => expect(serwer.wywolania.some((w) => w.sciezka === TESTY_KURSU)).toBe(true));
    return wynik;
  }

  function wierszTestu(): HTMLElement {
    return screen.getByRole("group", { name: "Test na koniec kursu" });
  }

  describe("kurs bez testu", () => {
    beforeEach(() => {
      serwer = utworzSerwer({ test: null });
    });

    it("pokazuje zdanie i przycisk „Dodaj test końcowy”; bez odnośnika do pytań i bez pola „Liczba pytań”", async () => {
      await renderEkranu();
      const wiersz = await screen.findByRole("group", { name: "Test na koniec kursu" });
      expect(within(wiersz).getByText("Kurs nie ma jeszcze testu końcowego.")).toBeInTheDocument();
      expect(within(wiersz).getByRole("button", { name: "Dodaj test końcowy" })).toBeInTheDocument();
      expect(within(wiersz).queryByRole("link", { name: "Otwórz pytania" })).toBeNull();
      expect(within(wiersz).queryByRole("button", { name: "Zmień próg i podejścia" })).toBeNull();
      expect(screen.queryByText(/Liczba pytań/)).toBeNull();
      expect(screen.queryByLabelText(/Liczba pytań/)).toBeNull();
    });

    it("„Dodaj test końcowy”: jedno żądanie POST z pustym ciałem na trasę roli, potem przejście do pytań testu", async () => {
      await renderEkranu();
      await userEvent.click(await screen.findByRole("button", { name: "Dodaj test końcowy" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith(pytania));
      expect(push).toHaveBeenCalledTimes(1);
      expect(serwer.zapisy()).toEqual([{ sciezka: TESTY_KURSU, metoda: "POST", cialo: {} }]);
      expect(serwer.sciezkiGrupy(obca)).toEqual([]);
      // Gdyby przejście zatrzymało pytanie ramy, wiersz pokazuje już test z odnośnikiem do pytań.
      expect(within(wierszTestu()).getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute("href", pytania);
      expect(within(wierszTestu()).getByText("Próg zaliczenia 80 % · 3 podejścia")).toBeInTheDocument();
    });

    it("drugie kliknięcie w trakcie zakładania nie wysyła drugiego żądania", async () => {
      let oddaj: (wartosc: unknown) => void = () => {};
      serwer.nadpisz("POST", TESTY_KURSU, () => new Promise((gotowe) => (oddaj = gotowe)));
      await renderEkranu();
      const przycisk = await screen.findByRole("button", { name: "Dodaj test końcowy" });
      await userEvent.click(przycisk);
      await userEvent.click(przycisk);
      expect(serwer.zapisy()).toHaveLength(1);
      oddaj(ZALOZONY);
      await waitFor(() => expect(push).toHaveBeenCalledWith(pytania));
    });

    it("odmowa 422: komunikat pola z serwera, bez przejścia, przycisk zostaje", async () => {
      serwer.nadpisz(
        "POST",
        TESTY_KURSU,
        () =>
          new ApiError({
            status: 422,
            code: "validation_failed",
            message: "Popraw zaznaczone pola.",
            errors: { pass_threshold: ["Próg zaliczenia musi mieścić się między 1 a 100 procent."] },
          }),
      );
      await renderEkranu();
      await userEvent.click(await screen.findByRole("button", { name: "Dodaj test końcowy" }));

      expect(await within(wierszTestu()).findByRole("alert")).toHaveTextContent(
        "Próg zaliczenia musi mieścić się między 1 a 100 procent.",
      );
      expect(push).not.toHaveBeenCalled();
      expect(within(wierszTestu()).getByRole("button", { name: "Dodaj test końcowy" })).toBeInTheDocument();
    });

    it("odmowa 403: komunikat serwera słowo w słowo", async () => {
      serwer.nadpisz(
        "POST",
        TESTY_KURSU,
        () => new ApiError({ status: 403, code: "forbidden", message: "Nie jesteś przypisany do tego kursu." }),
      );
      await renderEkranu();
      await userEvent.click(await screen.findByRole("button", { name: "Dodaj test końcowy" }));

      expect(await within(wierszTestu()).findByRole("alert")).toHaveTextContent("Nie jesteś przypisany do tego kursu.");
      expect(push).not.toHaveBeenCalled();
    });

    it("409 (test powstał w międzyczasie): komunikat serwera, wiersz czyta test od nowa i daje odnośnik do pytań", async () => {
      let wywolania = 0;
      serwer.nadpisz("GET", TESTY_KURSU, () => (wywolania++ === 0 ? null : ZALOZONY));
      serwer.nadpisz(
        "POST",
        TESTY_KURSU,
        () => new ApiError({ status: 409, code: "test_exists", message: "Ten kurs ma już test." }),
      );
      await renderEkranu();
      await userEvent.click(await screen.findByRole("button", { name: "Dodaj test końcowy" }));

      expect(await within(wierszTestu()).findByRole("link", { name: "Otwórz pytania" })).toHaveAttribute("href", pytania);
      expect(within(wierszTestu()).getByText("Ten kurs ma już test.")).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it("błąd sieci: „Spróbuj ponownie”, a ponowne kliknięcie zakłada test", async () => {
      let pierwsze = true;
      serwer.nadpisz("POST", TESTY_KURSU, () => {
        if (pierwsze) {
          pierwsze = false;
          return new TypeError("Failed to fetch");
        }
        return ZALOZONY;
      });
      await renderEkranu();
      await userEvent.click(await screen.findByRole("button", { name: "Dodaj test końcowy" }));

      expect(await within(wierszTestu()).findByRole("alert")).toHaveTextContent(
        "Nie udało się dodać testu końcowego. Spróbuj ponownie.",
      );
      expect(push).not.toHaveBeenCalled();

      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Dodaj test końcowy" }));
      await waitFor(() => expect(push).toHaveBeenCalledWith(pytania));
      expect(serwer.zapisy().map((w) => `${w.metoda} ${w.sciezka}`)).toEqual([`POST ${TESTY_KURSU}`, `POST ${TESTY_KURSU}`]);
    });
  });

  describe("kurs z testem — próg i podejścia w wierszu", () => {
    beforeEach(() => {
      serwer = utworzSerwer();
    });

    it("wiersz pokazuje próg i podejścia, odnośnik do pytań; bez „Dodaj test końcowy” i bez „Liczby pytań”", async () => {
      await renderEkranu();
      const wiersz = await screen.findByRole("group", { name: "Test na koniec kursu" });
      expect(await within(wiersz).findByText("Próg zaliczenia 80 % · 3 podejścia")).toBeInTheDocument();
      expect(within(wiersz).getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute("href", pytania);
      expect(within(wiersz).queryByRole("button", { name: "Dodaj test końcowy" })).toBeNull();
      await userEvent.click(within(wiersz).getByRole("button", { name: "Zmień próg i podejścia" }));
      expect(screen.queryByLabelText(/Liczba pytań/)).toBeNull();
    });

    it("zmiana progu i podejść: PATCH z dokładnym ciałem na trasę roli, wiersz pokazuje nowe wartości", async () => {
      await renderEkranu();
      const zmien = await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" });
      expect(zmien).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(zmien);
      expect(zmien).toHaveAttribute("aria-expanded", "true");

      const prog = screen.getByLabelText("Próg zaliczenia (%)");
      const podejscia = screen.getByLabelText("Liczba podejść");
      expect(prog).toHaveValue(80);
      expect(podejscia).toHaveValue(3);
      await userEvent.clear(prog);
      await userEvent.type(prog, "70");
      await userEvent.clear(podejscia);
      await userEvent.type(podejscia, "2");
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));

      expect(await within(wierszTestu()).findByText("Próg zaliczenia 70 % · 2 podejścia")).toBeInTheDocument();
      expect(serwer.zapisy()).toEqual([
        { sciezka: ZAPIS_TESTU, metoda: "PATCH", cialo: { pass_threshold: 70, attempts_limit: 2 } },
      ]);
      expect(screen.queryByLabelText("Próg zaliczenia (%)")).toBeNull();
      expect(serwer.sciezkiGrupy(obca)).toEqual([]);
    });

    it("jedno podejście: odmiana „1 podejście”", async () => {
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      const podejscia = screen.getByLabelText("Liczba podejść");
      await userEvent.clear(podejscia);
      await userEvent.type(podejscia, "1");
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));
      expect(await within(wierszTestu()).findByText("Próg zaliczenia 80 % · 1 podejście")).toBeInTheDocument();
    });

    it("próg poza zakresem: zdanie przy polu, bez żądania", async () => {
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      const prog = screen.getByLabelText("Próg zaliczenia (%)");
      await userEvent.clear(prog);
      await userEvent.type(prog, "0");
      const podejscia = screen.getByLabelText("Liczba podejść");
      await userEvent.clear(podejscia);
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));

      expect(await screen.findByText("Próg zaliczenia musi mieścić się między 1 a 100 procent.")).toBeInTheDocument();
      expect(screen.getByText("Liczba podejść musi mieścić się między 1 a 255.")).toBeInTheDocument();
      expect(prog).toHaveAttribute("aria-invalid", "true");
      expect(serwer.zapisy()).toEqual([]);
    });

    it("odmowa 422 przy zapisie: komunikat serwera przy polu, formularz zostaje otwarty", async () => {
      serwer.nadpisz(
        "PATCH",
        ZAPIS_TESTU,
        () =>
          new ApiError({
            status: 422,
            code: "validation_failed",
            message: "Popraw zaznaczone pola.",
            errors: { attempts_limit: ["Limit podejść musi mieścić się między 1 a 255."] },
          }),
      );
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));

      expect(await screen.findByText("Limit podejść musi mieścić się między 1 a 255.")).toBeInTheDocument();
      expect(screen.getByLabelText("Liczba podejść")).toHaveAttribute("aria-invalid", "true");
      expect(within(wierszTestu()).getByText("Próg zaliczenia 80 % · 3 podejścia")).toBeInTheDocument();
    });

    it("odmowa 403 przy zapisie: komunikat serwera słowo w słowo", async () => {
      serwer.nadpisz(
        "PATCH",
        ZAPIS_TESTU,
        () => new ApiError({ status: 403, code: "forbidden", message: "Nie jesteś przypisany do tego kursu." }),
      );
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));

      expect(await within(wierszTestu()).findByRole("alert")).toHaveTextContent("Nie jesteś przypisany do tego kursu.");
    });

    it("błąd sieci przy zapisie: „Spróbuj ponownie”", async () => {
      serwer.nadpisz("PATCH", ZAPIS_TESTU, () => new TypeError("Failed to fetch"));
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Zapisz próg i podejścia" }));

      expect(await within(wierszTestu()).findByRole("alert")).toHaveTextContent(
        "Nie udało się zapisać progu i podejść. Spróbuj ponownie.",
      );
    });

    it("„Anuluj” zamyka formularz bez żądania", async () => {
      await renderEkranu();
      await userEvent.click(await within(wierszTestu()).findByRole("button", { name: "Zmień próg i podejścia" }));
      await userEvent.click(within(wierszTestu()).getByRole("button", { name: "Anuluj" }));
      expect(screen.queryByLabelText("Próg zaliczenia (%)")).toBeNull();
      expect(serwer.zapisy()).toEqual([]);
    });
  });
});
