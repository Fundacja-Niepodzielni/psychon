import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { odpowiedzPulpitu } from "./atrapa";

const pobierzPulpitAdministracji = vi.fn();
const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", () => ({
  pobierzPulpitAdministracji: (...args: unknown[]) => pobierzPulpitAdministracji(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PulpitAdministracji } = await import("../PulpitAdministracji");

const ZERA = odpowiedzPulpitu({
  queues: [
    { key: "applications", count: 0, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 0, link: "/admin/staz" },
  ],
});

/** Każdy stan ekranu: jeden main z id=tresc i znacznik szablonu pulpitu w DOM. */
function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-pulpit");
}

function przyciskiGlowne(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === "Otwórz sprawy");
}

beforeEach(() => {
  pobierzPulpitAdministracji.mockReset();
  push.mockReset();
  back.mockReset();
});

describe("kontrola sprawdzenia szablonu", () => {
  it("odrzuca DOM z dwoma main, z innym id i bez znacznika szablonu", () => {
    const dwa = document.createElement("div");
    dwa.innerHTML = '<main id="tresc" tabindex="-1" data-style-id="szablon-pulpit"></main><main></main>';
    expect(() => sprawdzSzablon(dwa)).toThrow();

    const beznaczn = document.createElement("div");
    beznaczn.innerHTML = '<main id="tresc" tabindex="-1"></main>';
    expect(() => sprawdzSzablon(beznaczn)).toThrow();

    const inneId = document.createElement("div");
    inneId.innerHTML = '<main id="inne" tabindex="-1" data-style-id="szablon-pulpit"></main>';
    expect(() => sprawdzSzablon(inneId)).toThrow();
  });
});

describe("Pulpit administracji — stany ekranu", () => {
  it("ładowanie: szkielet w szablonie, brak przycisku głównego i brak liczb", () => {
    pobierzPulpitAdministracji.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PulpitAdministracji />);

    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();
  });

  it("dane: liczniki, sprawy z liczbami i odnośnikami z odpowiedzi, jeden przycisk główny", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(screen.getByText("Ukończenia programu")).toBeInTheDocument();
    expect(screen.getByText("Wydane certyfikaty")).toBeInTheDocument();
    expect(container.querySelector("#pulpit-uczestnicy")?.textContent).toContain("12");
    expect(container.querySelector("#pulpit-certyfikaty")?.textContent).toContain("2");

    const odnosnik = screen.getByRole("link", { name: "Otwórz: Zgłoszenia rekrutacyjne" });
    expect(odnosnik).toHaveAttribute("href", "/admin/uczestniczki");
    expect(screen.getByRole("link", { name: "Otwórz: Pytania bez odpowiedzi" })).toHaveAttribute(
      "href",
      "/prowadzacy/pytania",
    );
    const karta = screen.getByRole("article", { name: "Zgłoszenia rekrutacyjne" });
    expect(container.querySelector("[data-obszar='wspierajaca']")?.contains(karta)).toBe(true);
    expect(screen.getByRole("heading", { level: 3, name: "Zgłoszenia rekrutacyjne" })).toBeTruthy();
    expect(karta.querySelector("#pulpit-zgloszenia")?.textContent).toContain("4");
    expect(screen.queryByText("Zgłoszenia do decyzji")).not.toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("dane: przycisk „Otwórz sprawy” przechodzi pod link kolejki applications", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);
    await waitFor(() => expect(przyciskiGlowne(container)).toHaveLength(1));

    await uzytkownik.click(przyciskiGlowne(container)[0]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/uczestniczki");
    expect(przyciskiGlowne(container)[0]).not.toHaveAttribute("aria-disabled");
  });

  it("pusty: wszystkie liczby zerowe pokazują „Brak spraw do decyzji”, liczniki zostają, przycisk niedostępny z powodem", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(ZERA);
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Otwórz:/ })).not.toBeInTheDocument();

    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Brak zgłoszeń rekrutacyjnych do decyzji.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Nie można otworzyć spraw")).toBeInTheDocument();
  });

  it("dane: inne kolejki mają sprawy, ale applications ma 0 — przycisk niedostępny z powodem, bez przejścia", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 0, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 7, link: "/admin/staz" },
        ],
      }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Otwórz: Dyżury czekające na decyzję" })).toBeInTheDocument(),
    );
    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Brak zgłoszeń rekrutacyjnych do decyzji.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
  });

  it("dane: bez kolejki applications w odpowiedzi przycisk jest niedostępny z powodem, bez przejścia", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({ queues: [{ key: "internship_entries", count: 7, link: "/admin/staz" }] }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Otwórz: Dyżury czekające na decyzję" })).toBeInTheDocument(),
    );
    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Odpowiedź serwera nie zawiera zgłoszeń rekrutacyjnych do otwarcia.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
  });

  it("pusty: odpowiedź bez kolejek też pokazuje stan pusty i przycisk bez celu", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu({ queues: [] }));
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("dane: kolejka z adresem spoza aplikacji nie ma odnośnika, a kliknięcie pokazuje ostrzeżenie", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 3, link: "https://obcy.example/x" },
          { key: "questions", count: 1, link: "/prowadzacy/pytania" },
        ],
      }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Zgłoszenia rekrutacyjne")).toBeInTheDocument());
    expect(container.querySelector("a[href^='http']")).toBeNull();
    await uzytkownik.click(screen.getByRole("button", { name: "Otwórz: Zgłoszenia rekrutacyjne" }));
    expect(screen.getByText("Adres tych spraw z odpowiedzi serwera jest nieprawidłowy.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("403 forbidden: komunikat o braku dostępu, bez liczb i bez przycisku głównego", async () => {
    pobierzPulpitAdministracji.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }),
    );
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText(/tylko dla administracji/)).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();
  });

  it("401: ten sam stan braku dostępu", async () => {
    pobierzPulpitAdministracji.mockRejectedValue(
      new ApiError({ status: 401, code: "unauthenticated", message: "Zaloguj się." }),
    );
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText(/tylko dla administracji/)).toBeInTheDocument());
    sprawdzSzablon(container);
  });

  it("błąd sieci: Notice z błędem, brak zmyślonych zer, ponowienie wczytuje dane", async () => {
    pobierzPulpitAdministracji
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(container.querySelector("[role='alert']")).toBeTruthy();
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(pobierzPulpitAdministracji).toHaveBeenCalledTimes(2);
  });

  it("odpowiedź o złym kształcie jest błędem, nie zerami", async () => {
    pobierzPulpitAdministracji.mockResolvedValue({ counters: { participants: "dużo" }, queues: [] });
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument());
    sprawdzSzablon(container);
  });

  it("odświeżenie ze stanu pustego wczytuje dane od nowa", async () => {
    pobierzPulpitAdministracji.mockResolvedValueOnce(ZERA).mockResolvedValueOnce(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Odśwież" }));
    await waitFor(() => expect(screen.getByRole("article", { name: "Zgłoszenia rekrutacyjne" })).toBeInTheDocument());
    expect(pobierzPulpitAdministracji).toHaveBeenCalledTimes(2);
  });

  it("przycisk powrotu w nagłówku wraca do poprzedniego ekranu", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    render(<PulpitAdministracji />);
    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
