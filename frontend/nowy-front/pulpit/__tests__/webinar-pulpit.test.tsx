import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { GODZINY, KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY, SZCZEGOL_W_TOKU, WARUNKI } from "./atrapy";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";
import { ADRES_TRANSMISJI, KONIEC_OKNA, odczytWebinaru, POCZATEK, SLUG_WEBINARU, UKONCZONY } from "../../kurs-uczestnika/__tests__/webinar-atrapy";
import { zdanieZamknietegoKursu } from "../ListaKursow";
import type { KursSciezki } from "../nastepny-krok";
import type { KursUczestnika } from "../../kurs-uczestnika/dane";

/**
 * Pulpit uczestnika z webinarami: karta najbliższego nieukończonego webinaru
 * (transmisja, potwierdzenie udziału, nagranie), webinar nigdy zamknięty ani
 * prowadzący do testu, następny krok nadal wskazuje kurs, zaplecze bez
 * webinarów działa jak dotąd (zero dodatkowych żądań). Dokładne żądania
 * webinaru: odczyt `GET /courses/{slug}` i `POST /courses/{slug}/attendance`.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const api = vi.fn();
const fetchSpy = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");

const ADRES_ODCZYTU = `/courses/${SLUG_WEBINARU}`;
const ADRES_OBECNOSCI = `/courses/${SLUG_WEBINARU}/attendance`;
const KOMUNIKAT_PRZED = "Obecność potwierdzisz od rozpoczęcia transmisji.";

const WEBINAR_NA_LISCIE: KursSciezki = {
  id: 12,
  slug: SLUG_WEBINARU,
  title: "Webinar: rozmowa w kryzysie",
  sequence_order: 2,
  status: "in_progress",
  progress_percent: 0,
  type: "webinar",
};

/** Odczyty szczegółów webinarów po slugu; pozostałe adresy webinaru to wynik `obecnosc`. */
function ustawApi(odczyty: Record<string, KursUczestnika | (() => Promise<unknown>)>, obecnosc: () => Promise<unknown> = () => Promise.resolve({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" })) {
  api.mockImplementation((sciezka: string) => {
    if (sciezka.endsWith("/attendance")) return obecnosc();
    const slug = sciezka.replace("/courses/", "");
    const odczyt = odczyty[slug];
    if (odczyt === undefined) return Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`));
    return typeof odczyt === "function" ? odczyt() : Promise.resolve(odczyt);
  });
}

function zegarNa(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

async function pokaz(kursy: KursSciezki[]) {
  pobierzKursy.mockResolvedValue(kursy);
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<PulpitUczestnika programUkonczony={false} />);
  });
  await screen.findByRole("heading", { level: 1, name: "Pulpit" });
  await waitFor(() => expect(document.querySelector('[data-karta="nastepny-krok"] h2')).not.toBeNull());
  return wynik!;
}

const karta = () => document.querySelector<HTMLElement>("[data-karta-webinaru]");
const wywolaniaWebinaru = () => api.mock.calls.filter(([sciezka]) => String(sciezka).includes(SLUG_WEBINARU));

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
  zegarNa("2026-11-05T12:00:00Z");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("karta webinaru — okno otwarte", () => {
  beforeEach(() => zegarNa("2026-11-05T17:30:00Z"));

  it("tytuł jako odnośnik do webinaru, termin w Warszawie, „Dołącz do transmisji” i czynny przycisk „Potwierdzam udział”", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) });
    await pokaz([KURS_UKONCZONY, KURS_W_TOKU, WEBINAR_NA_LISCIE]);

    const k = karta()!;
    expect(k).not.toBeNull();
    expect(within(k).getByRole("heading", { level: 2, name: "Najbliższy webinar" })).toBeInTheDocument();
    expect(within(k).getByRole("link", { name: "Webinar: rozmowa w kryzysie" })).toHaveAttribute("href", `/panel/kursy/${SLUG_WEBINARU}`);
    expect(within(k).getByText("czwartek, 5 listopada 2026, 18:00")).toBeInTheDocument();
    const transmisja = within(k).getByRole("link", { name: "Dołącz do transmisji" });
    expect(transmisja).toHaveAttribute("href", ADRES_TRANSMISJI);
    expect(transmisja).toHaveAttribute("target", "_blank");
    expect(transmisja).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(k).getByRole("button", { name: "Potwierdzam udział" })).not.toHaveAttribute("aria-disabled");
  });

  it("karta jest regionem, a nie sekcją listy szablonu; „Dołącz do transmisji” to atom odnośnika w otoczce przycisku", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);

    const k = karta()!;
    expect(k.tagName).toBe("DIV");
    expect(screen.getByRole("region", { name: "Najbliższy webinar" })).toBe(k);
    const transmisja = within(k).getByRole("link", { name: "Dołącz do transmisji" });
    expect(transmisja.parentElement?.tagName).toBe("SPAN");
    expect(transmisja.parentElement?.className).not.toBe("");
  });

  it("kliknięcie: dokładnie jedno POST bez ciała, potem zdanie z datą i godziną zamiast przycisku", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    await act(async () => {
      fireEvent.click(within(karta()!).getByRole("button", { name: "Potwierdzam udział" }));
    });

    expect(await within(karta()!).findByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeInTheDocument();
    expect(within(karta()!).queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(wywolaniaWebinaru()).toEqual([[ADRES_ODCZYTU], [ADRES_OBECNOSCI, { method: "POST" }]]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("odmowa 422: zdanie serwera w karcie, przycisk wraca do oczekiwania na okno", async () => {
    ustawApi(
      { [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) },
      () => Promise.reject(new ApiError({ status: 422, code: "conditions_not_met", message: KOMUNIKAT_PRZED, reason: { window: "before", opens_at: POCZATEK, closes_at: KONIEC_OKNA } })),
    );
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    await act(async () => {
      fireEvent.click(within(karta()!).getByRole("button", { name: "Potwierdzam udział" }));
    });
    expect(await within(karta()!).findByText(KOMUNIKAT_PRZED)).toBeInTheDocument();
    expect(within(karta()!).queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(within(karta()!).getByText("Udział potwierdzisz od 18:00.")).toBeInTheDocument();
  });

  it("brak połączenia przy potwierdzeniu: komunikat i „Spróbuj ponownie”", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) }, () => Promise.reject(new TypeError("Failed to fetch")));
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    await act(async () => {
      fireEvent.click(within(karta()!).getByRole("button", { name: "Potwierdzam udział" }));
    });
    expect(await within(karta()!).findByText(/Nie udało się połączyć z serwerem/)).toBeInTheDocument();
    expect(within(karta()!).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });
});

describe("karta webinaru — przed i po oknie", () => {
  it("przed oknem: transmisja i zdanie „od 18:00”, bez przycisku potwierdzenia i bez nagrania", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru() });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    const k = karta()!;
    expect(within(k).getByRole("link", { name: "Dołącz do transmisji" })).toBeInTheDocument();
    expect(within(k).getByText("Udział potwierdzisz od 18:00.")).toBeInTheDocument();
    expect(within(k).queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
    expect(within(k).queryByRole("link", { name: "Obejrzyj nagranie" })).toBeNull();
  });

  it("po oknie z nagraniem: „Obejrzyj nagranie” prowadzi na istniejący ekran lekcji, bez przycisku potwierdzenia", async () => {
    zegarNa("2026-11-06T09:00:00Z");
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "closed", recording_lesson_id: 345 }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    const k = karta()!;
    expect(within(k).getByRole("link", { name: "Obejrzyj nagranie" })).toHaveAttribute("href", `/panel/lekcje/345?kurs=${SLUG_WEBINARU}`);
    expect(within(k).getByText("Czas na potwierdzenie udziału minął.")).toBeInTheDocument();
    expect(within(k).queryByRole("button", { name: "Potwierdzam udział" })).toBeNull();
  });

  it("po oknie bez nagrania: „Nagranie pojawi się wkrótce.”", async () => {
    zegarNa("2026-11-06T09:00:00Z");
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "closed" }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    expect(within(karta()!).getByText("Nagranie pojawi się wkrótce.")).toBeInTheDocument();
    expect(within(karta()!).queryByRole("link", { name: "Obejrzyj nagranie" })).toBeNull();
  });

  it("adres transmisji spoza https nie daje odnośnika", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ stream_url: "javascript:alert(1)" }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    expect(within(karta()!).queryByRole("link", { name: "Dołącz do transmisji" })).toBeNull();
  });
});

describe("karta webinaru — kiedy jej nie ma i które webinary wybiera", () => {
  it("zaplecze bez webinarów (bez pola `type`): brak karty i ani jednego dodatkowego żądania", async () => {
    await pokaz([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY]);
    expect(karta()).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByText("Najbliższy webinar")).toBeNull();
  });

  it("jedyny webinar jest ukończony: brak karty i brak żądania o jego szczegóły", async () => {
    await pokaz([KURS_W_TOKU, { ...WEBINAR_NA_LISCIE, status: "completed", progress_percent: 100 }]);
    expect(karta()).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("kilka nieukończonych: szczegóły każdego raz, na karcie najbliższy według okna i terminu", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    const pozniejszy = { ...WEBINAR_NA_LISCIE, id: 13, slug: "webinar-pozniejszy", title: "Webinar późniejszy", sequence_order: 3 };
    ustawApi({
      [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }),
      "webinar-pozniejszy": odczytWebinaru({ id: 13, slug: "webinar-pozniejszy", title: "Webinar późniejszy", starts_at: "2026-11-12T17:00:00Z", attendance_closes_at: "2026-11-12T23:00:00Z", attendance_window: "before" }),
    });
    await pokaz([KURS_W_TOKU, pozniejszy, WEBINAR_NA_LISCIE]);
    expect(within(karta()!).getByRole("link", { name: "Webinar: rozmowa w kryzysie" })).toBeInTheDocument();
    expect(within(karta()!).queryByText("Webinar późniejszy")).toBeNull();
    expect(api.mock.calls.map(([sciezka]) => sciezka).sort()).toEqual([ADRES_ODCZYTU, "/courses/webinar-pozniejszy"]);
  });

  it("ukończony w odczycie szczegółów (np. obecność potwierdzona gdzie indziej): karty nie ma", async () => {
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "closed", attended_at: "2026-11-05T17:04:11Z", ...UKONCZONY }) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(karta()).toBeNull();
  });

  it("błąd odczytu webinaru: ostrzeżenie w jego obszarze, reszta pulpitu działa", async () => {
    ustawApi({ [SLUG_WEBINARU]: () => Promise.reject(new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." })) });
    await pokaz([KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    expect(await screen.findByText("Webinar niedostępny")).toBeInTheDocument();
    expect(screen.getByText("Nie udało się wczytać najbliższego webinaru.")).toBeInTheDocument();
    expect(karta()).toBeNull();
    expect(screen.getByRole("button", { name: "Wróć do lekcji" })).toBeInTheDocument();
  });
});

describe("webinar na pulpicie nie zmienia kursów", () => {
  beforeEach(() => ustawApi({ [SLUG_WEBINARU]: odczytWebinaru() }));

  it("następny krok nadal wskazuje nieukończony kurs, nigdy test z powodu webinaru; jeden przycisk główny", async () => {
    const { container } = await pokaz([KURS_UKONCZONY, WEBINAR_NA_LISCIE, KURS_W_TOKU]);
    szablonPulpitu(container);
    expect(screen.getByRole("button", { name: "Wróć do lekcji" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Przejdź do testu" })).toBeNull();
    expect(document.querySelector('[data-karta="nastepny-krok"] h2')?.textContent).toMatch(/Struktura wywiadu/);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Wróć do lekcji" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/22?kurs=wywiad-psychologiczny");
  });

  it("szczegóły etapu w toku czytane dla kursu, nie dla webinaru", async () => {
    await pokaz([WEBINAR_NA_LISCIE, KURS_W_TOKU]);
    expect(pobierzSzczegolKursu).toHaveBeenCalledTimes(1);
    expect(pobierzSzczegolKursu).toHaveBeenCalledWith("wywiad-psychologiczny");
  });

  it("wszystkie kursy ukończone, webinar nie: krok „certyfikat”, nie test", async () => {
    await pokaz([KURS_UKONCZONY, WEBINAR_NA_LISCIE]);
    expect(screen.getByRole("button", { name: "Zobacz warunki certyfikatu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Przejdź do testu" })).toBeNull();
  });

  it("lista ścieżki: webinar w jednym rzędzie z kursami, „w toku”, z odnośnikiem „Otwórz webinar: …”, nigdy zamknięty", async () => {
    await pokaz([KURS_UKONCZONY, { ...WEBINAR_NA_LISCIE, status: "locked" }, KURS_ZABLOKOWANY]);
    const wiersz = document.querySelector<HTMLElement>(`[data-kurs-stan="in_progress"]`);
    expect(wiersz).not.toBeNull();
    expect(wiersz).toHaveTextContent("Webinar: rozmowa w kryzysie");
    expect(wiersz).toHaveTextContent("w toku");
    expect(within(wiersz!).getByRole("link", { name: "Otwórz webinar: Webinar: rozmowa w kryzysie" })).toHaveAttribute("href", `/panel/kursy/${SLUG_WEBINARU}`);
    // Zamknięty jest wyłącznie kurs; webinaru nie ma wśród zamkniętych.
    const zamkniete = [...document.querySelectorAll<HTMLElement>('[data-kurs-stan="locked"]')];
    expect(zamkniete).toHaveLength(1);
    expect(zamkniete[0]).toHaveTextContent("Interwencja kryzysowa");
  });

  it("kafel „Kursy w programie” liczy tylko kursy, bez webinarów", async () => {
    await pokaz([KURS_UKONCZONY, WEBINAR_NA_LISCIE, KURS_W_TOKU, KURS_ZABLOKOWANY]);
    expect(screen.getAllByText("z 3 ukończony").length).toBeGreaterThan(0);
  });

  it("zdanie wiersza zamkniętego kursu nie nazywa webinaru poprzednim kursem", () => {
    const kurs3: KursSciezki = { ...KURS_ZABLOKOWANY };
    const kursy: KursSciezki[] = [{ ...KURS_UKONCZONY, sequence_order: 1 }, { ...WEBINAR_NA_LISCIE, sequence_order: 2 }, kurs3];
    expect(zdanieZamknietegoKursu(kurs3, kursy)).toBe("Otworzy się po ukończeniu kursu „Podstawy pomocy psychologicznej”.");
    expect(zdanieZamknietegoKursu(kurs3, [WEBINAR_NA_LISCIE, kurs3])).toBe("Otworzy się po ukończeniu poprzedniego kursu.");
  });
});

describe("pulpit z kartą webinaru — dostępność", () => {
  it("lista, karta i krok bez naruszeń axe", async () => {
    zegarNa("2026-11-05T17:30:00Z");
    ustawApi({ [SLUG_WEBINARU]: odczytWebinaru({ attendance_window: "open" }) });
    const { container } = await pokaz([KURS_UKONCZONY, KURS_W_TOKU, WEBINAR_NA_LISCIE]);
    expect((await axeViolations(container)).map((n) => n.id)).toEqual([]);
  });
});
