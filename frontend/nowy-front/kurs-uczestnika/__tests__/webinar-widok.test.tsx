import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kursSzkicu } from "./atrapy";
import { ADRES_TRANSMISJI, KONIEC_OKNA, lekcjaNagrania, odczytWebinaru, POCZATEK, SLUG_WEBINARU, UKONCZONY } from "./webinar-atrapy";
import type { KursUczestnika } from "../dane";

/**
 * Widok webinaru w ekranie kursu uczestnika: każdy stan okna obecności (przed,
 * otwarte, otwarte po potwierdzeniu, zamknięte bez nagrania i z nagraniem,
 * ukończony), odmowy serwera (422 przed i po oknie, 403, 404), brak
 * połączenia, adres transmisji spoza https, zaplecze bez pola `type` oraz
 * dokładne wywołania API (adres, metoda, puste ciało; żadnego innego hosta).
 */

const api = vi.fn();
const push = vi.fn();
const fetchSpy = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { KursUczestnika } = await import("../KursUczestnika");

const ADRES_OBECNOSCI = `/courses/${SLUG_WEBINARU}/attendance`;
const ADRES_ODCZYTU = `/courses/${SLUG_WEBINARU}`;
const KOMUNIKAT_PRZED = "Obecność potwierdzisz od rozpoczęcia transmisji.";
const KOMUNIKAT_PO = "Czas na potwierdzenie obecności minął. Obejrzyj nagranie, żeby ukończyć webinar.";

function zegarNa(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  zegarNa("2026-11-05T12:00:00Z");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Obecnosc = () => Promise<unknown>;

/** Odczyt kursu zwraca `kurs`; potwierdzenie — wynik `obecnosc`. */
async function pokaz(kurs: KursUczestnika, obecnosc: Obecnosc = () => Promise.resolve({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" }), opcje: { podglad?: boolean; rola?: string | null } = {}) {
  api.mockImplementation((sciezka: string) => (sciezka === ADRES_OBECNOSCI ? obecnosc() : Promise.resolve(kurs)));
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<KursUczestnika slug={SLUG_WEBINARU} podglad={opcje.podglad} rola={opcje.rola ?? null} />);
  });
  await screen.findByRole("heading", { level: 1, name: kurs.title });
  return wynik!;
}

const przyciskObecnosci = () => screen.getByRole("button", { name: "Potwierdzam udział" });
const przyciskiGlowne = () => [...document.querySelectorAll<HTMLElement>("[data-przycisk-glowny]")];
const wywolaniaObecnosci = () => api.mock.calls.filter(([sciezka]) => sciezka === ADRES_OBECNOSCI);
function odmowa(status: number, code: string, message: string, reason?: Record<string, unknown>) {
  return () => Promise.reject(new ApiError({ status, code, message, reason }));
}

describe("webinar — przed oknem obecności", () => {
  it("tytuł, opis i termin w Warszawie z dniem tygodnia, jeden nagłówek pierwszego stopnia", async () => {
    const { container } = await pokaz(odczytWebinaru());
    expect(() => jedenMain(container)).not.toThrow();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("czwartek, 5 listopada 2026, 18:00")).toBeInTheDocument();
    expect(screen.getByText("Spotkanie na żywo z prowadzącą o tym, jak rozmawiać z osobą w kryzysie.")).toBeInTheDocument();
  });

  it("przycisk „Potwierdzam udział” jest widoczny, ale nieczynny, z powodem „od 18:00”; kliknięcie niczego nie wysyła", async () => {
    await pokaz(odczytWebinaru());
    const przycisk = przyciskObecnosci();
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Udział potwierdzisz od 18:00.");
    fireEvent.click(przycisk);
    expect(wywolaniaObecnosci()).toHaveLength(0);
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("odnośnik do transmisji: „Dołącz do transmisji”, nowa karta, bezpieczne rel, widoczny od publikacji", async () => {
    await pokaz(odczytWebinaru());
    const odnosnik = screen.getByRole("link", { name: "Dołącz do transmisji" });
    expect(odnosnik).toHaveAttribute("href", ADRES_TRANSMISJI);
    expect(odnosnik).toHaveAttribute("target", "_blank");
    expect(odnosnik).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("bez nagrania i bez zdania o upływie czasu", async () => {
    await pokaz(odczytWebinaru());
    expect(screen.queryByText(/Nagranie pojawi się wkrótce/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Obejrzyj nagranie" })).toBeNull();
    expect(screen.queryByText("Czas na potwierdzenie udziału minął.")).toBeNull();
  });
});

describe("webinar — okno otwarte", () => {
  beforeEach(() => zegarNa("2026-11-05T17:30:00Z"));

  it("przycisk czynny i jedyny przycisk główny na ekranie", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }));
    const przycisk = przyciskObecnosci();
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przyciskiGlowne()).toEqual([przycisk]);
  });

  it("kliknięcie: dokładnie jedno POST pod adres obecności, bez ciała; potem zdanie z datą i godziną, bez przycisku", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }));
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });

    expect(await screen.findByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeInTheDocument();
    expect(api.mock.calls).toEqual([[ADRES_ODCZYTU], [ADRES_OBECNOSCI, { method: "POST" }]]);
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(screen.getByText("Webinar ukończony")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("zdanie o potwierdzeniu jest w obszarze komunikatów i dostaje fokus", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }));
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });
    const zdanie = await screen.findByText("Udział potwierdzony 5 listopada 2026, 18:04.");
    expect(screen.getByRole("status")).toContainElement(zdanie);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("status")));
  });

  it("w czasie zapisu przycisk jest nieczynny i drugie kliknięcie niczego nie wysyła", async () => {
    let zakoncz: (wartosc: unknown) => void = () => {};
    await pokaz(odczytWebinaru({ attendance_window: "open" }), () => new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });
    const wToku = screen.getByRole("button", { name: "Zapisywanie…" });
    expect(wToku).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(wToku);
    expect(wywolaniaObecnosci()).toHaveLength(1);
    await act(async () => zakoncz({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" }));
    expect(await screen.findByText(/Udział potwierdzony/)).toBeInTheDocument();
  });

  it("okno otwiera się z upływem czasu, bez ponownego wczytania strony", async () => {
    zegarNa("2026-11-05T16:59:00Z");
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-05T16:59:00Z"));
    await pokaz(odczytWebinaru());
    expect(przyciskObecnosci()).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    expect(przyciskObecnosci()).not.toHaveAttribute("aria-disabled");
    expect(api.mock.calls.filter(([sciezka]) => sciezka === ADRES_ODCZYTU)).toHaveLength(1);
  });
});

describe("webinar — po potwierdzeniu i po ukończeniu", () => {
  it("potwierdzenie z odczytu: zdanie z datą, potwierdzenie ukończenia na górze, bez przycisku i bez wywołania POST", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    await pokaz(odczytWebinaru({ attendance_window: "open", attended_at: "2026-11-05T17:04:11Z", ...UKONCZONY }));
    expect(screen.getByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeInTheDocument();
    expect(screen.getByText("Webinar ukończony")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(wywolaniaObecnosci()).toHaveLength(0);
  });

  it("ukończony przez nagranie: potwierdzenie na górze, zdanie o nagraniu, bez przycisku obecności i bez zdania o upływie czasu", async () => {
    zegarNa("2026-11-06T09:00:00Z");
    await pokaz(odczytWebinaru({ attendance_window: "closed", recording_lesson_id: 345, lessons: [lekcjaNagrania()], ...UKONCZONY }));
    expect(screen.getByText("Webinar ukończony")).toBeInTheDocument();
    expect(screen.getByText("Nagranie obejrzane.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(screen.queryByText("Czas na potwierdzenie udziału minął.")).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });
});

describe("webinar — okno zamknięte", () => {
  beforeEach(() => zegarNa("2026-11-06T09:00:00Z"));

  it("bez nagrania: zdanie o upływie czasu i „Nagranie pojawi się wkrótce.”, bez przycisku i bez odnośnika do nagrania", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "closed" }));
    expect(screen.getByText("Czas na potwierdzenie udziału minął.")).toBeInTheDocument();
    expect(screen.getByText("Nagranie pojawi się wkrótce.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Obejrzyj nagranie" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("z nagraniem: „Obejrzyj nagranie” prowadzi na istniejący ekran lekcji tego nagrania i jest przyciskiem głównym", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "closed", recording_lesson_id: 345, lessons: [lekcjaNagrania()] }));
    const odnosnik = screen.getByRole("link", { name: "Obejrzyj nagranie" });
    expect(odnosnik).toHaveAttribute("href", `/panel/lekcje/345?kurs=${SLUG_WEBINARU}`);
    expect(przyciskiGlowne()).toEqual([odnosnik]);
    expect(screen.getByText("Czas na potwierdzenie udziału minął.")).toBeInTheDocument();
    expect(screen.queryByText("Nagranie pojawi się wkrótce.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
  });

  it("transmisja nadal widoczna jako odnośnik, o ile adres jest https", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "closed" }));
    expect(screen.getByRole("link", { name: "Dołącz do transmisji" })).toHaveAttribute("href", ADRES_TRANSMISJI);
  });
});

describe("webinar — odmowy serwera pokazują zdanie serwera", () => {
  beforeEach(() => zegarNa("2026-11-05T17:30:00Z"));

  async function kliknij() {
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });
  }

  it("422 przed oknem: zdanie serwera, przycisk wraca do stanu nieczynnego, okno według serwera", async () => {
    await pokaz(
      odczytWebinaru({ attendance_window: "open" }),
      odmowa(422, "conditions_not_met", KOMUNIKAT_PRZED, { window: "before", opens_at: POCZATEK, closes_at: KONIEC_OKNA }),
    );
    await kliknij();
    expect(await screen.findByText(KOMUNIKAT_PRZED)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(KOMUNIKAT_PRZED);
    expect(przyciskObecnosci()).toHaveAttribute("aria-disabled", "true");
    expect(przyciskObecnosci()).toHaveAccessibleDescription("Udział potwierdzisz od 18:00.");
    expect(screen.queryByText("Udział potwierdzony", { exact: false })).toBeNull();
  });

  it("422 po oknie: zdanie serwera, przycisk znika, pokazuje się część o nagraniu", async () => {
    await pokaz(
      odczytWebinaru({ attendance_window: "open" }),
      odmowa(422, "conditions_not_met", KOMUNIKAT_PO, { window: "closed", opens_at: POCZATEK, closes_at: KONIEC_OKNA }),
    );
    await kliknij();
    expect(await screen.findByText(KOMUNIKAT_PO)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(screen.getByText("Czas na potwierdzenie udziału minął.")).toBeInTheDocument();
    expect(screen.getByText("Nagranie pojawi się wkrótce.")).toBeInTheDocument();
  });

  it("422 z innym zdaniem niż w kontrakcie: pokazujemy zdanie serwera, nie własne", async () => {
    await pokaz(
      odczytWebinaru({ attendance_window: "open" }),
      odmowa(422, "conditions_not_met", "Zupełnie inne zdanie serwera.", { window: "before", opens_at: POCZATEK, closes_at: KONIEC_OKNA }),
    );
    await kliknij();
    expect(await screen.findByText("Zupełnie inne zdanie serwera.")).toBeInTheDocument();
    expect(screen.queryByText(KOMUNIKAT_PRZED)).toBeNull();
  });

  it("403: zdanie serwera, przycisk zostaje, zdania o potwierdzeniu nie ma", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }), odmowa(403, "forbidden", "Ta czynność jest dla uczestników."));
    await kliknij();
    expect(await screen.findByText("Ta czynność jest dla uczestników.")).toBeInTheDocument();
    expect(przyciskObecnosci()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(/Udział potwierdzony/)).toBeNull();
  });

  it("403 access_expired: zdanie serwera o wygasłym dostępie", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }), odmowa(403, "access_expired", "Twój dostęp wygasł."));
    await kliknij();
    expect(await screen.findByText("Twój dostęp wygasł.")).toBeInTheDocument();
  });

  it("404: zdanie serwera", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }), odmowa(404, "not_found", "Nie znaleziono zasobu."));
    await kliknij();
    expect(await screen.findByText("Nie znaleziono zasobu.")).toBeInTheDocument();
  });

  it("inny błąd serwera (500): zdanie serwera i „Spróbuj ponownie”", async () => {
    await pokaz(odczytWebinaru({ attendance_window: "open" }), odmowa(500, "server_error", "Błąd serwera."));
    await kliknij();
    expect(await screen.findByText("Błąd serwera.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });

  it("brak połączenia: komunikat i „Spróbuj ponownie”, które po sukcesie pokazuje potwierdzenie", async () => {
    let proba = 0;
    await pokaz(odczytWebinaru({ attendance_window: "open" }), () =>
      ++proba === 1 ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" }),
    );
    await kliknij();
    expect(await screen.findByRole("heading", { level: 3, name: "Brak połączenia" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(await screen.findByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeInTheDocument();
    expect(wywolaniaObecnosci()).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("webinar — adres transmisji tylko https", () => {
  it.each(["http://transmisja.example.org/x", "javascript:alert(1)", "data:text/html,x", "ftp://transmisja.example.org/x", "//transmisja.example.org/x", "", null])(
    "adres %j: brak odnośnika „Dołącz do transmisji”",
    async (adres) => {
      await pokaz(odczytWebinaru({ stream_url: adres }));
      expect(screen.queryByRole("link", { name: "Dołącz do transmisji" })).toBeNull();
      expect(document.querySelector("a[href^='javascript:'], a[href^='data:'], a[href^='http:']")).toBeNull();
      // Reszta ekranu działa bez odnośnika.
      expect(przyciskObecnosci()).toBeInTheDocument();
    },
  );

  it("brak pola `stream_url` w odczycie: brak odnośnika", async () => {
    const odczyt = odczytWebinaru();
    delete odczyt.stream_url;
    await pokaz(odczyt);
    expect(screen.queryByRole("link", { name: "Dołącz do transmisji" })).toBeNull();
  });
});

describe("webinar — bez tematów, lekcji i testu; nigdy zamknięty", () => {
  it("nie pokazuje listy lekcji, tematów ani karty testu, także gdy `lessons` niesie lekcję z nagraniem", async () => {
    zegarNa("2026-11-06T09:00:00Z");
    await pokaz(odczytWebinaru({ attendance_window: "closed", recording_lesson_id: 345, lessons: [lekcjaNagrania()] }));
    expect(document.querySelector("[data-lekcja]")).toBeNull();
    expect(document.querySelector("[data-temat]")).toBeNull();
    expect(document.querySelector("[data-karta-testu]")).toBeNull();
    expect(screen.queryByText("Test końcowy")).toBeNull();
    expect(screen.queryByText(/lekcj/i, { selector: "h2" })).toBeNull();
    expect(screen.queryByText(/zamknięt|Po ukończeniu lekcji/i)).toBeNull();
  });

  it("webinar jest otwarty niezależnie od postępu w kursach: nigdy kłódki ani odmowy", async () => {
    await pokaz(odczytWebinaru({ progress_percent: 0 }));
    expect(screen.queryByText(/kłód|zamknięt/i)).toBeNull();
    expect(document.querySelector("[data-zamknieta]")).toBeNull();
  });
});

describe("webinar — tryb podglądu", () => {
  it("pas podglądu, przycisk obecności nieczynny z powodem i bez żądania, odnośnik do nagrania z parametrem podglądu", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    await pokaz(odczytWebinaru({ attendance_window: "open", recording_lesson_id: 345, lessons: [lekcjaNagrania()] }), undefined, { podglad: true, rola: "project_manager" });
    expect(screen.getByRole("region", { name: "Tryb podglądu" })).toBeInTheDocument();
    const przycisk = screen.getByRole("button", { name: "Potwierdzam udział" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("W podglądzie nic się nie zapisuje.");
    fireEvent.click(przycisk);
    expect(wywolaniaObecnosci()).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Obejrzyj nagranie" }).getAttribute("href")).toMatch(/\/panel\/lekcje\/345\?kurs=webinar-o-kryzysie&podglad=1$/);
  });
});

describe("zaplecze bez pola `type` i kurs: ekran jak dotąd", () => {
  it("odczyt bez `type` pokazuje zwykły kurs: lekcje, przycisk główny, karta testu, zero treści webinaru", async () => {
    api.mockImplementation(() => Promise.resolve(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 })));
    await act(async () => {
      render(<KursUczestnika slug="pierwsza-pomoc-psychologiczna" />);
    });
    await screen.findByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" });
    expect(screen.getByRole("link", { name: "Kontynuuj lekcję 3" })).toBeInTheDocument();
    expect(document.querySelector("[data-karta-testu]")).not.toBeNull();
    expect(document.querySelectorAll("[data-lekcja]")).toHaveLength(7);
    expect(screen.queryByText(/Potwierdzam udział|Dołącz do transmisji|Obejrzyj nagranie/)).toBeNull();
    expect(api.mock.calls).toEqual([["/courses/pierwsza-pomoc-psychologiczna"]]);
  });

  it("`type: \"course\"` z pustymi polami webinaru to zwykły kurs", async () => {
    const kurs = { ...kursSzkicu({ ukonczone: 0, zamknieteOd: 2 }), type: "course", starts_at: null, stream_url: null, attendance_window: null, attended_at: null, recording_lesson_id: null } as KursUczestnika;
    api.mockImplementation(() => Promise.resolve(kurs));
    await act(async () => {
      render(<KursUczestnika slug="pierwsza-pomoc-psychologiczna" />);
    });
    await screen.findByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" });
    expect(screen.getByRole("link", { name: "Rozpocznij lekcję 1" })).toBeInTheDocument();
    expect(screen.queryByText(/Potwierdzam udział/)).toBeNull();
  });
});

describe("webinar — wywołania API i hosty", () => {
  it("cały przebieg: odczyt GET, jedno POST bez ciała; ścieżki względne, `fetch` nigdy nie woła innego hosta", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    await pokaz(odczytWebinaru({ attendance_window: "open" }));
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });
    await screen.findByText(/Udział potwierdzony/);

    expect(api.mock.calls).toEqual([[ADRES_ODCZYTU], [ADRES_OBECNOSCI, { method: "POST" }]]);
    for (const [sciezka, opcje] of api.mock.calls) {
      expect(String(sciezka).startsWith("/courses/")).toBe(true);
      expect(String(sciezka)).not.toMatch(/^[a-z]+:\/\//i);
      expect(opcje === undefined || !("body" in (opcje as object))).toBe(true);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("odnośnik do transmisji nie wywołuje żadnego żądania (to tylko odnośnik)", async () => {
    await pokaz(odczytWebinaru());
    fireEvent.click(screen.getByRole("link", { name: "Dołącz do transmisji" }));
    expect(api.mock.calls).toEqual([[ADRES_ODCZYTU]]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("webinar — dostępność (axe)", () => {
  it.each([
    ["przed oknem", odczytWebinaru(), "2026-11-05T12:00:00Z"],
    ["okno otwarte", odczytWebinaru({ attendance_window: "open" }), "2026-11-05T17:30:00Z"],
    ["zamknięte z nagraniem", odczytWebinaru({ attendance_window: "closed", recording_lesson_id: 345, lessons: [lekcjaNagrania()] }), "2026-11-06T09:00:00Z"],
    ["ukończony", odczytWebinaru({ attendance_window: "closed", attended_at: "2026-11-05T17:04:11Z", ...UKONCZONY }), "2026-11-06T09:00:00Z"],
  ])("%s: bez naruszeń", async (_nazwa, odczyt, teraz) => {
    zegarNa(teraz);
    const { container } = await pokaz(odczyt);
    expect((await axeViolations(container)).map((n) => n.id)).toEqual([]);
  });

  it("po odmowie 422 (komunikat z rolą alert): bez naruszeń", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    const { container } = await pokaz(odczytWebinaru({ attendance_window: "open" }), odmowa(422, "conditions_not_met", KOMUNIKAT_PRZED, { window: "before", opens_at: POCZATEK, closes_at: KONIEC_OKNA }));
    await act(async () => {
      fireEvent.click(przyciskObecnosci());
    });
    await screen.findByText(KOMUNIKAT_PRZED);
    expect((await axeViolations(container)).map((n) => n.id)).toEqual([]);
    expect(within(container).getByRole("alert")).toBeInTheDocument();
  });
});
