import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { LekcjaAdmin, StanNagrania } from "../dane";

/**
 * Strona lekcji czyta stan nagrania z pól serwera i pyta o niego ponownie
 * tylko dla nagrania w drodze: nie częściej niż co 30 s (zegar próbny), tylko
 * przy widocznej karcie przeglądarki, do stanu końcowego. Lekcja gotowa, bez
 * nagrania, z błędem, ze stanem nieustalonym i odpowiedź bez pól stanu nie
 * wywołują żadnego pytania poza pierwszym odczytem.
 */

const api = vi.fn();
const pobierzJa = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...argumenty: unknown[]) => api(...argumenty) };
});

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...argumenty: unknown[]) => pobierzJa(...argumenty),
}));

const { LekcjaEdycja } = await import("../LekcjaEdycja");

const PODGLAD = "https://podglad.atrapa.test/osadzenie";

const LEKCJA: LekcjaAdmin = {
  id: 21,
  course_id: 3,
  title: "Wprowadzenie do wywiadu",
  description: "Krótki opis",
  content: "Treść lekcji.",
  sequence_order: 1,
  topic_id: 7,
  topic_position: 1,
  video_provider_id: "wideo-21",
  duration_seconds: 1800,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

type ZNagraniem = Extract<StanNagrania, { status: "processing" | "finished" | "error" }>;

function stan(reszta: Partial<ZNagraniem>): ZNagraniem {
  return { status: "processing", duration_seconds: 1800, preview_embed_url: PODGLAD, video_status_at: null, ...reszta };
}

const BRAK: StanNagrania = { status: "no_video", video_status: "none", video_status_at: null, video_ready: false, video_pending: false };
const WYSYLANE = stan({ video_status: "uploading", video_ready: false, video_pending: true });
const PRZETWARZANE = stan({ video_status: "processing", video_ready: false, video_pending: true });
const GOTOWE = stan({ status: "finished", video_status: "ready", video_ready: true, video_pending: false });
const BLAD = stan({ status: "error", video_status: "error", video_ready: false, video_pending: false });
const NIEUSTALONY = stan({ video_status: null, video_ready: true, video_pending: false });
const WYMIANA = stan({ video_status: "processing", video_ready: true, video_pending: true });
const WYMIANA_Z_BLEDEM = stan({ status: "error", video_status: "error", video_ready: true, video_pending: true });
const BEZ_POL_PRZETWARZANIE: StanNagrania = { status: "processing", duration_seconds: 0, preview_embed_url: null };

/** Kolejne odpowiedzi trasy stanu; ostatnia powtarza się. `null` = trasa nie odpowiada. */
let odpowiedzi: (StanNagrania | null)[] = [];
let ukryta = false;

function ustawApi(lekcja: LekcjaAdmin = LEKCJA) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "super_admin" });
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/admin/courses/3/lessons") return [lekcja];
    if (sciezka === "/admin/lessons/21/video-status") {
      const odpowiedz = odpowiedzi.length > 1 ? odpowiedzi.shift()! : odpowiedzi[0];
      if (odpowiedz === null) throw new Error("Trasa stanu nie odpowiada");
      return odpowiedz;
    }
    throw new Error(`Nieoczekiwana trasa: ${sciezka}`);
  });
}

function pytaniaOStan(): number {
  return api.mock.calls.filter(([sciezka]) => sciezka === "/admin/lessons/21/video-status").length;
}

async function otworz(kolejne: (StanNagrania | null)[], lekcja?: LekcjaAdmin) {
  odpowiedzi = [...kolejne];
  ustawApi(lekcja);
  render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
}

async function minelo(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function ukryjKarte(czyUkryta: boolean) {
  ukryta = czyUkryta;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function kartaNagrania(): HTMLElement {
  return screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section") as HTMLElement;
}

function kartaStanu(): HTMLElement {
  return screen.getByRole("heading", { level: 2, name: "Stan lekcji" }).closest("section") as HTMLElement;
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  ukryta = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => ukryta });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
});

describe("pytania o stan nagrania: tylko dla nagrania w drodze", () => {
  it.each([
    ["gotowa", GOTOWE],
    ["bez nagrania", BRAK],
    ["z błędem nagrania", BLAD],
    ["ze stanem nieustalonym", NIEUSTALONY],
    ["z nowym nagraniem zakończonym błędem obok gotowego", WYMIANA_Z_BLEDEM],
    ["z odpowiedzią bez pól stanu (przetwarzanie)", BEZ_POL_PRZETWARZANIE],
  ])("lekcja %s: zero pytań poza pierwszym odczytem, także po pięciu minutach", async (_nazwa, odpowiedz) => {
    await otworz([odpowiedz]);
    expect(pytaniaOStan()).toBe(1);
    await minelo(5 * 60_000);
    expect(pytaniaOStan()).toBe(1);
  });

  it("przetwarzanie: kolejne pytanie nie wcześniej niż po 30 s, potem co 30 s", async () => {
    await otworz([PRZETWARZANE]);
    expect(pytaniaOStan()).toBe(1);
    await minelo(29_000);
    expect(pytaniaOStan()).toBe(1);
    await minelo(1_500);
    expect(pytaniaOStan()).toBe(2);
    await minelo(29_000);
    expect(pytaniaOStan()).toBe(2);
    await minelo(1_500);
    expect(pytaniaOStan()).toBe(3);
  });

  it("plik wysyłany skądinąd też jest w drodze: pytanie po 30 s", async () => {
    await otworz([WYSYLANE]);
    expect(kartaNagrania().querySelector('[data-stan-nagrania="wysylane"]')).not.toBeNull();
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
  });

  it("stop po `ready`: czas trwania i podgląd z odpowiedzi, dalej żadnych pytań", async () => {
    await otworz([PRZETWARZANE, { ...GOTOWE, duration_seconds: 245 }]);
    expect(kartaNagrania().querySelector('[data-stan-nagrania="przetwarzanie"]')).not.toBeNull();
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
    expect(kartaNagrania()).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 4 min 5 s.");
    expect(within(kartaNagrania()).getByRole("link", { name: /Otwórz podgląd nagrania/ })).toHaveAttribute("href", PODGLAD);
    expect(kartaStanu()).toHaveTextContent(/Gotowe:.*nagranie/);
    await minelo(5 * 60_000);
    expect(pytaniaOStan()).toBe(2);
  });

  it("po `ready` pole czasu idzie za czasem nagrania i nie robi się z tego niezapisana zmiana", async () => {
    await otworz([PRZETWARZANE, { ...GOTOWE, duration_seconds: 240 }]);
    expect(screen.getByLabelText(/^Czas trwania w minutach/)).toHaveValue(30);
    await minelo(30_500);
    expect(screen.getByLabelText(/^Czas trwania w minutach/)).toHaveValue(4);
    expect(screen.getAllByRole("status").some((element) => /Wszystko zapisane/.test(element.textContent ?? ""))).toBe(true);
    expect(kartaStanu().textContent).not.toMatch(/czas trwania 0/);
  });

  it("stop po `error`: zdanie błędu, dalej żadnych pytań", async () => {
    await otworz([PRZETWARZANE, BLAD]);
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
    expect(within(kartaNagrania()).getByText("Przetwarzanie nagrania zakończyło się błędem.")).toBeInTheDocument();
    expect(kartaStanu()).toHaveTextContent("Wymaga uwagi: nagranie trzeba wysłać ponownie.");
    await minelo(5 * 60_000);
    expect(pytaniaOStan()).toBe(2);
  });

  it("nieudany odczyt niczego nie zmienia: stan zostaje, następne pytanie po kolejnych 30 s", async () => {
    await otworz([PRZETWARZANE, null, GOTOWE]);
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
    expect(kartaNagrania().querySelector('[data-stan-nagrania="przetwarzanie"]')).not.toBeNull();
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(3);
    expect(kartaNagrania().querySelector('[data-stan-nagrania="gotowe"]')).not.toBeNull();
  });
});

describe("pytania o stan nagrania: tylko przy widocznej karcie przeglądarki", () => {
  it("ukryta karta nie pyta; po powrocie pyta od razu, a następnie znów nie wcześniej niż po 30 s", async () => {
    await otworz([PRZETWARZANE]);
    ukryjKarte(true);
    await minelo(3 * 60_000);
    expect(pytaniaOStan()).toBe(1);

    ukryjKarte(false);
    await minelo(100);
    expect(pytaniaOStan()).toBe(2);
    await minelo(29_000);
    expect(pytaniaOStan()).toBe(2);
    await minelo(1_500);
    expect(pytaniaOStan()).toBe(3);
  });

  it("krótkie ukrycie nie skraca odstępu: po powrocie pytanie dopiero po reszcie 30 s", async () => {
    await otworz([PRZETWARZANE]);
    await minelo(10_000);
    ukryjKarte(true);
    await minelo(5_000);
    ukryjKarte(false);
    await minelo(10_000);
    expect(pytaniaOStan()).toBe(1);
    await minelo(6_000);
    expect(pytaniaOStan()).toBe(2);
  });
});

describe("wymiana nagrania na stronie lekcji", () => {
  it("gotowe i nowe w drodze: karta mówi wprost o dotychczasowym nagraniu, „Stan lekcji” ma nagranie w gotowych", async () => {
    await otworz([WYMIANA]);
    expect(
      within(kartaNagrania()).getByText(/Uczestnicy oglądają dotychczasowe nagranie\. Nowe nagranie się przetwarza/),
    ).toBeInTheDocument();
    expect(kartaNagrania()).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 30 min 0 s.");
    expect(kartaStanu()).toHaveTextContent(/Gotowe:.*nagranie\./);
    expect(kartaStanu()).toHaveTextContent("Czekamy: nowe nagranie się przetwarza.");
    expect(kartaStanu().textContent).not.toMatch(/Wymaga uwagi/);
  });

  it("błąd nowego nagrania nie odbiera dotychczasowego; pytania o stan ustają", async () => {
    await otworz([WYMIANA, WYMIANA_Z_BLEDEM]);
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
    expect(kartaNagrania()).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 30 min 0 s.");
    expect(
      within(kartaNagrania()).getByText("Nowe nagranie nie zostało przetworzone. Uczestnicy nadal oglądają dotychczasowe nagranie."),
    ).toBeInTheDocument();
    expect(kartaStanu()).toHaveTextContent(/Gotowe:.*nagranie\./);
    expect(kartaStanu()).toHaveTextContent("Wymaga uwagi: nowe nagranie trzeba wysłać ponownie.");
    await minelo(5 * 60_000);
    expect(pytaniaOStan()).toBe(2);
  });

  it("nowe nagranie gotowe: wymiana znika z karty", async () => {
    await otworz([WYMIANA, GOTOWE]);
    await minelo(30_500);
    expect(kartaNagrania().textContent).not.toMatch(/dotychczasowe/);
    expect(kartaStanu().textContent).not.toMatch(/Czekamy/);
  });
});

describe("stan nieustalony i brak pól", () => {
  it("stan nieustalony (`null`) wygląda jak gotowe", async () => {
    await otworz([NIEUSTALONY]);
    expect(kartaNagrania()).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 30 min 0 s.");
    expect(kartaStanu()).toHaveTextContent(/Gotowe:.*nagranie\./);
  });

  it("odpowiedź bez pól stanu: przetwarzanie ze zdaniem o ponownym otwarciu lekcji, bez błędu", async () => {
    await otworz([BEZ_POL_PRZETWARZANIE]);
    expect(within(kartaNagrania()).getByText("Gotowe nagranie zobaczysz tutaj po ponownym otwarciu lekcji.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("trasa stanu nie odpowiada, ale lekcja niesie pola: stan z lekcji, a pytanie o stan idzie po 30 s", async () => {
    await otworz([null, GOTOWE], { ...LEKCJA, video_status: "processing", video_ready: false, video_pending: true });
    expect(kartaNagrania().querySelector('[data-stan-nagrania="przetwarzanie"]')).not.toBeNull();
    expect(pytaniaOStan()).toBe(1);
    await minelo(30_500);
    expect(pytaniaOStan()).toBe(2);
    expect(kartaNagrania().querySelector('[data-stan-nagrania="gotowe"]')).not.toBeNull();
  });

  it("trasa stanu nie odpowiada i lekcja nie niesie pól: stan nieznany, bez pytań", async () => {
    await otworz([null]);
    expect(within(kartaNagrania()).getByText("Nie udało się sprawdzić stanu nagrania.")).toBeInTheDocument();
    await minelo(5 * 60_000);
    expect(pytaniaOStan()).toBe(1);
  });
});
