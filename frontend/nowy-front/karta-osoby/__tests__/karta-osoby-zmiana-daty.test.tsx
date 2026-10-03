import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import { ATRYBUT_OBSZARU } from "@/design-system/organizmy/Dialog/obszarOgloszen";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * „Zmień datę” w nagłówku karty osoby: przycisk obok daty dostępu tylko dla ról,
 * które dopuszcza trasa zmiany daty, okno formularza nad kartą, kontrola pól,
 * zapis tą samą trasą co dawny ekran przedłużenia (`POST .../extend-access`,
 * `until` i `reason`), nowa data w nagłówku i zdanie w stałym obszarze ogłoszeń po
 * sukcesie, błędy serwera w oknie. Dzień „dziś” jest ustawiony na 30.09.2026.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const pobierzIdZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const api = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
    pobierzRoleZalogowanej: (...args: unknown[]) => pobierzRoleZalogowanej(...args),
    pobierzIdZalogowanej: (...args: unknown[]) => pobierzIdZalogowanej(...args),
  };
});

vi.mock("@/lib/api/h18", async () => {
  const rzeczywiste = await vi.importActual<typeof import("@/lib/api/h18")>("@/lib/api/h18");
  return { ...rzeczywiste, fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PRZYCISK = "Zmień datę";
const TYTUL_OKNA = "Zmień datę dostępu: Marta Demo";

/** Północ UTC podanego dnia `YYYY-MM-DD` jako znacznik ISO, składana z `Date.UTC`. */
function polnocUTC(dzien: string): string {
  const [rok, miesiac, dzienMiesiaca] = dzien.split("-").map(Number);
  return new Date(Date.UTC(rok, miesiac - 1, dzienMiesiaca)).toISOString();
}

function osobaPoZmianie(data: string) {
  return {
    id: 17,
    first_name: "Marta",
    last_name: "Demo",
    email: "marta@demo.pl",
    role: "volunteer",
    roles: ["volunteer"],
    access_expires_at: data,
    program_completed_at: null,
  };
}

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera.", errors });
}

function zapisy() {
  return api.mock.calls.filter((wywolanie) => (wywolanie[1] as { method?: string } | undefined)?.method === "POST");
}

const obszarOgloszen = () => document.querySelector<HTMLElement>(`[${ATRYBUT_OBSZARU}]`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa({ workshopDone: false }));
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  // Zalogowana osoba to nie osoba z karty (id 17).
  pobierzIdZalogowanej.mockReset().mockResolvedValue(1);
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  api.mockReset().mockImplementation(async (_sciezka: string, opcje?: { body?: { until?: string } }) =>
    osobaPoZmianie(polnocUTC(opcje?.body?.until ?? "2027-03-31")),
  );
  const obszar = obszarOgloszen();
  if (obszar) obszar.textContent = "";
});

afterEach(() => {
  vi.useRealTimers();
});

async function otworzOkno() {
  render(<KartaOsoby id={17} />);
  await userEvent.click(await screen.findByRole("button", { name: PRZYCISK }));
  return screen.getByRole("dialog", { name: TYTUL_OKNA });
}

async function wypelnij(okno: HTMLElement, data: string, powod = "Zmiana terminu stażu w grupie wsparcia.") {
  const pole = within(okno).getByLabelText(/Nowa data dostępu/);
  await userEvent.clear(pole);
  if (data !== "") await userEvent.type(pole, data);
  if (powod !== "") await userEvent.type(within(okno).getByRole("textbox", { name: /Powód zmiany/ }), powod);
}

describe("Karta osoby — przycisk „Zmień datę” w nagłówku", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi przycisk obok daty dostępu w nagłówku karty", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    const przycisk = await screen.findByRole("button", { name: PRZYCISK });
    const naglowek = screen.getByTestId("obszar-naglowek");
    expect(naglowek).toContainElement(przycisk);
    const wiersz = przycisk.closest("[data-obszar='data-dostepu']") as HTMLElement;
    expect(within(wiersz).getByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma przycisku, a datę widzi", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it.each("instructor project_manager super_admin".split(" "))(
    "karta osoby o roli %s (bez terminu dostępu): przycisku nie ma, a datę dostępu karta pokazuje",
    async (rolaOsoby) => {
      pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ role: rolaOsoby }));
      render(<KartaOsoby id={17} />);
      expect(await screen.findByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
      await waitFor(() => expect(pobierzIdZalogowanej).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
    },
  );

  it.each(["volunteer", "student"])("karta osoby o roli %s (w programie): przycisk jest", async (rolaOsoby) => {
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ role: rolaOsoby }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it("własna karta zalogowanej osoby (id zgodne): przycisku nie ma", async () => {
    pobierzIdZalogowanej.mockResolvedValue(17);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
    await waitFor(() => expect(pobierzIdZalogowanej).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull());
  });

  it("nieznany identyfikator zalogowanej osoby (odczyt konta się nie udał): przycisk jest, własność rozstrzyga zapis", async () => {
    pobierzIdZalogowanej.mockRejectedValue(new Error("sieć"));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it("nieznana rola (odczyt konta się nie udał): przycisku nie ma, karta działa", async () => {
    pobierzRoleZalogowanej.mockRejectedValue(new Error("sieć"));
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do 1 lutego 2027");
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("osoba bez daty końca: nagłówek mówi „bezterminowo”, przycisk jest", async () => {
    const karta = kartaPrzykladowa();
    pobierzKarteOsoby.mockResolvedValue({ ...karta, profile: { ...karta.profile, access_expires_at: null } });
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText("Dostęp do materiałów: bezterminowo")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it("w trakcie edycji danych przycisku nie ma — na ekranie zostaje jeden rząd przycisków formularza", async () => {
    render(<KartaOsoby id={17} />);
    await screen.findByRole("button", { name: PRZYCISK });
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane" }));
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("karta nie ma już wejścia na osobny ekran przedłużenia", async () => {
    render(<KartaOsoby id={17} adresPrzedluzenia="/nowy-front/admin/uczestniczki/17/przedluzenie" />);
    await screen.findByRole("button", { name: PRZYCISK });
    expect(screen.queryByRole("button", { name: /Przedłuż/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Przedłuż/ })).toBeNull();
  });
});

describe("Karta osoby — okno „Zmień datę dostępu”", () => {
  it("okno formularza: tytuł z imieniem i nazwiskiem, obecna data w opisie, dwa pola, „Anuluj” i „Zapisz datę”", async () => {
    const okno = await otworzOkno();
    expect(okno).toHaveAccessibleDescription("Obecna data dostępu: 1 lutego 2027.");
    const data = within(okno).getByLabelText(/Nowa data dostępu/);
    expect(data).toHaveAttribute("type", "date");
    expect(data).toHaveFocus();
    const powod = within(okno).getByRole("textbox", { name: /Powód zmiany/ });
    expect(powod).toHaveAccessibleDescription("Pisz rzeczowo, bez informacji o zdrowiu.");
    expect(within(okno).getByRole("button", { name: "Anuluj" })).toBeInTheDocument();
    expect(within(okno).getByRole("button", { name: "Zapisz datę" })).toHaveAttribute("type", "submit");
    const glowne = within(okno)
      .getAllByRole("button")
      .filter((przycisk) => przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)));
    expect(glowne.map((przycisk) => przycisk.textContent)).toEqual(["Zapisz datę"]);
  });

  it("okno nie ma naruszeń dostępności", async () => {
    const okno = await otworzOkno();
    expect(await axeViolations(okno)).toEqual([]);
  });

  it("osoba bez daty końca: opis mówi „brak ustawionej daty”", async () => {
    const karta = kartaPrzykladowa();
    pobierzKarteOsoby.mockResolvedValue({ ...karta, profile: { ...karta.profile, access_expires_at: null } });
    const okno = await otworzOkno();
    expect(okno).toHaveAccessibleDescription("Obecna data dostępu: brak ustawionej daty.");
  });

  it("puste pola: oba błędy w podsumowaniu z fokusem i przy polach, żadnego żądania zapisu", async () => {
    const okno = await otworzOkno();
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = within(okno).getByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(podsumowanie).toHaveFocus();
    expect(within(podsumowanie).getByRole("link", { name: "Data końca dostępu musi być późniejsza niż dzisiejsza." })).toHaveAttribute(
      "href",
      "#karta-zmiana-daty-data",
    );
    expect(within(podsumowanie).getByRole("link", { name: "Wpisz powód zmiany." })).toBeInTheDocument();
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveAccessibleDescription(
      expect.stringContaining("Data końca dostępu musi być późniejsza niż dzisiejsza."),
    );
    expect(zapisy()).toHaveLength(0);
  });

  it.each([
    ["dzisiejsza", "2026-09-30"],
    ["wczorajsza", "2026-09-29"],
  ])("data %s: „Data końca dostępu musi być późniejsza niż dzisiejsza.”, bez żądania zapisu", async (_nazwa, data) => {
    const okno = await otworzOkno();
    await wypelnij(okno, data);
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    expect(within(okno).getAllByText("Data końca dostępu musi być późniejsza niż dzisiejsza.").length).toBeGreaterThan(0);
    expect(zapisy()).toHaveLength(0);
  });

  it("sam powód bez daty i sama data bez powodu: błąd tylko brakującego pola", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31", "");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = within(okno).getByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(podsumowanie).getAllByRole("link")).toHaveLength(1);
    expect(within(podsumowanie).getByRole("link", { name: "Wpisz powód zmiany." })).toBeInTheDocument();
    expect(zapisy()).toHaveLength(0);
  });

  it("data wcześniejsza niż obecna: podpowiedź, że dostęp zostanie skrócony", async () => {
    const okno = await otworzOkno();
    const pole = within(okno).getByLabelText(/Nowa data dostępu/);
    expect(pole).toHaveAccessibleDescription("Dostęp do materiałów będzie otwarty do tego dnia.");
    await userEvent.type(pole, "2026-12-01");
    expect(pole).toHaveAccessibleDescription("Wybrana data jest wcześniejsza niż obecna — dostęp zostanie skrócony.");
  });

  it("zapis: jeden POST trasą extend-access z until i reason (przyciętym); nowa data w nagłówku, zdanie w stałym obszarze ogłoszeń, fokus na „Zmień datę”", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31", "  Zmiana terminu stażu w grupie wsparcia.  ");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(zapisy()).toHaveLength(1);
    expect(zapisy()[0]).toEqual([
      "/admin/users/17/extend-access",
      { method: "POST", body: { until: "2027-03-31", reason: "Zmiana terminu stażu w grupie wsparcia." } },
    ]);
    expect(screen.getByText("Dostęp do materiałów do 31 marca 2027")).toBeInTheDocument();
    await waitFor(() => expect(obszarOgloszen()).toHaveTextContent("Data dostępu zmieniona na 31 marca 2027."));
    expect(screen.getByRole("button", { name: PRZYCISK })).toHaveFocus();
  });

  it("po zapisie nigdzie nie pada słowo „przedłużony” — zdanie jest neutralne", async () => {
    const { container } = render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("button", { name: PRZYCISK }));
    await wypelnij(screen.getByRole("dialog"), "2026-12-01");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz datę" }));
    await waitFor(() => expect(obszarOgloszen()).toHaveTextContent("Data dostępu zmieniona na 1 grudnia 2026."));
    expect(obszarOgloszen()?.textContent).not.toMatch(/przedłuż/i);
    expect(container.textContent).not.toMatch(/przedłużon/i);
  });

  it("w czasie zapisu przycisk mówi „Zapisywanie…”, a drugie wysłanie nie wychodzi", async () => {
    let zakoncz: (wartosc: unknown) => void = () => undefined;
    api.mockReturnValue(new Promise((resolve) => (zakoncz = resolve)));
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const zapisywanie = within(okno).getByRole("button", { name: "Zapisywanie…" });
    expect(zapisywanie).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(zapisywanie);
    await userEvent.type(within(okno).getByLabelText(/Nowa data dostępu/), "{Enter}");
    expect(zapisy()).toHaveLength(1);
    zakoncz(osobaPoZmianie(polnocUTC("2027-03-31")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("422 z polem until: komunikat serwera przy polu daty i w podsumowaniu, wpisane dane zostają", async () => {
    api.mockRejectedValue(blad(422, "validation_failed", { until: ["Pole until nie jest prawidłową datą."] }));
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(podsumowanie).getByRole("link", { name: "Pole until nie jest prawidłową datą." })).toBeInTheDocument();
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveValue("2027-03-31");
    expect(within(okno).getByRole("textbox", { name: /Powód zmiany/ })).toHaveValue("Zmiana terminu stażu w grupie wsparcia.");
  });

  it("422 z polem reason: komunikat serwera przy polu powodu i w podsumowaniu, wpisane dane zostają, data bez błędu", async () => {
    api.mockRejectedValue(blad(422, "validation_failed", { reason: ["Powód zmiany jest wymagany (serwer)."] }));
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(podsumowanie).getByRole("link", { name: "Powód zmiany jest wymagany (serwer)." })).toBeInTheDocument();
    const powod = within(okno).getByRole("textbox", { name: /Powód zmiany/ });
    expect(powod).toHaveAccessibleDescription(expect.stringContaining("Powód zmiany jest wymagany (serwer)."));
    expect(powod).toHaveValue("Zmiana terminu stażu w grupie wsparcia.");
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveValue("2027-03-31");
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).not.toHaveAttribute("aria-invalid", "true");
    expect(obszarOgloszen()?.textContent ?? "").toBe("");
  });

  it("pole daty podpowiada granicę: atrybut max = dziś + 24 miesiące (30.09.2026 → 2028-09-30)", async () => {
    const okno = await otworzOkno();
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveAttribute("max", "2028-09-30");
  });

  it("data równo 24 miesiące od dziś przechodzi do zapisu, dzień później daje błąd przy polu i brak żądania", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2028-10-01");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(podsumowanie).getByRole("link", { name: "Nowa data dostępu może być najwyżej 24 miesiące od dziś." })).toBeInTheDocument();
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveAccessibleDescription(
      expect.stringContaining("Nowa data dostępu może być najwyżej 24 miesiące od dziś."),
    );
    expect(zapisy()).toHaveLength(0);

    await userEvent.clear(within(okno).getByLabelText(/Nowa data dostępu/));
    await userEvent.type(within(okno).getByLabelText(/Nowa data dostępu/), "2028-09-30");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0][1]).toEqual({ method: "POST", body: { until: "2028-09-30", reason: "Zmiana terminu stażu w grupie wsparcia." } });
  });

  it("powód dłuższy niż 1000 znaków: błąd przy polu, bez żądania do serwera", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31", "");
    fireEvent.change(within(okno).getByRole("textbox", { name: /Powód zmiany/ }), { target: { value: "a".repeat(1001) } });
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(podsumowanie).getByRole("link", { name: "Powód może mieć najwyżej 1000 znaków." })).toBeInTheDocument();
    expect(zapisy()).toHaveLength(0);
  });

  it.each([
    ["422 bez pól", () => blad(422, "validation_failed"), "Popraw datę i spróbuj ponownie. Data dostępu nie została zmieniona."],
    ["403", () => blad(403, "forbidden"), zdanieOdmowyRoli("administracji")],
    ["401", () => blad(401, "unauthenticated"), zdanieOdmowyRoli("administracji")],
    ["404", () => blad(404, "not_found"), "Nie znaleziono osoby. Data dostępu nie została zmieniona."],
    [
      "422 cannot_extend_self",
      () => new ApiError({ status: 422, code: "cannot_extend_self", message: "Nie można zmienić daty dostępu własnego konta." }),
      "Nie można zmienić daty dostępu własnego konta.",
    ],
    [
      "422 access_date_not_applicable",
      () =>
        new ApiError({
          status: 422,
          code: "access_date_not_applicable",
          message: "Konta prowadzących i administracji nie mają terminu dostępu. Takie konto wyłącza się blokadą.",
        }),
      "Konta prowadzących i administracji nie mają terminu dostępu. Takie konto wyłącza się blokadą.",
    ],
    ["błąd sieci", () => new TypeError("Failed to fetch"), "Nie udało się zmienić daty dostępu. Data nie została zmieniona — spróbuj ponownie."],
  ])("%s przy zapisie: zdanie na górze okna, data w nagłówku bez zmian, brak ogłoszenia sukcesu", async (_nazwa, wyjatek, zdanie) => {
    api.mockRejectedValue(wyjatek());
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    const podsumowanie = await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(podsumowanie).toHaveTextContent(zdanie);
    expect(podsumowanie).toHaveFocus();
    expect(screen.getByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
    expect(obszarOgloszen()?.textContent ?? "").toBe("");
  });

  it("błąd sieci przy zapisie: pola zostają, ponowny zapis się udaje", async () => {
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    await within(okno).findByRole("group", { name: "Data dostępu nie została zmieniona" });
    expect(within(okno).getByLabelText(/Nowa data dostępu/)).toHaveValue("2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(zapisy()).toHaveLength(2);
    expect(screen.getByText("Dostęp do materiałów do 31 marca 2027")).toBeInTheDocument();
  });

  it("okno niczego nie wysyła do dziennika działań: jedyny zapis to zmiana daty", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz datę" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.mock.calls.map((wywolanie) => wywolanie[0])).toEqual(["/admin/users/17/extend-access"]);
  });

  it("„Anuluj” zamyka okno bez żadnego zapisu, fokus wraca na „Zmień datę”", async () => {
    const okno = await otworzOkno();
    await wypelnij(okno, "2027-03-31");
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zapisy()).toHaveLength(0);
    expect(screen.getByRole("button", { name: PRZYCISK })).toHaveFocus();
    expect(screen.getByText("Dostęp do materiałów do 1 lutego 2027")).toBeInTheDocument();
  });

  it("Escape z wpisanymi danymi pyta „Porzucić wpisane dane?”; bez danych zamyka", async () => {
    let okno = await otworzOkno();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    okno = screen.getByRole("dialog", { name: TYTUL_OKNA });
    await userEvent.type(within(okno).getByRole("textbox", { name: /Powód zmiany/ }), "Zmiana");
    await userEvent.keyboard("{Escape}");
    expect(within(okno).getByRole("group", { name: "Porzucić wpisane dane?" })).toBeInTheDocument();
    expect(zapisy()).toHaveLength(0);
  });

  it("wpisane dane w oknie zgłaszają ramie niezapisane zmiany; zamknięcie okna je zdejmuje", async () => {
    const okno = await otworzOkno();
    expect(saPowodyPytania()).toBe(false);
    await userEvent.type(within(okno).getByRole("textbox", { name: /Powód zmiany/ }), "Zmiana");
    await waitFor(() => expect(saPowodyPytania()).toBe(true));
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(saPowodyPytania()).toBe(false));
  });
});
