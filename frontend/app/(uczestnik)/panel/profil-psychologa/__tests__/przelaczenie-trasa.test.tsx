import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { czyTrasaWNowejRamce } from "@/lib/przelaczenie/ramka";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/profil-psychologa` czyta rejestr przełączenia (grupa
 * `profilPsychologa`): adres się nie zmienia, zmienia się treść. Grupa
 * wyłączona → dokładnie stara treść (`StaraTresc`, ten sam DOM co przy
 * renderze samej `StaraTresc`); grupa włączona → ekran nowego frontu
 * (`NowyEkran`) bez własnego `main` (jedyny `main` niesie układ panelu).
 * Tytuł strony w obu wariantach zostaje „Profil psychologa — Niepodzielni”.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/profil-psychologa",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

/** Wniosek zapisany jako wersja robocza — dane fikcyjne, te same co w teście starej strony. */
const WNIOSEK = {
  eligible: true,
  specializations: ["wsparcie w kryzysie"],
  approach: "poznawczo-behawioralny",
  city: "Kraków",
  bio: null,
  publication_consent_granted: false,
  status: "draft",
  return_reason: null,
  documents: [],
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

// Pierwszy import strony ładuje obie treści (stary formularz i ekran nowego frontu) na zimno;
// rozgrzewka poza limitem pojedynczego testu, żeby limit 5 s mierzył test, nie transformację modułów.
beforeAll(async () => {
  await import("../page");
}, 60_000);

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  przywrocRejestr();
});

function atrapaZWnioskiem() {
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/psychologist-profile") return Promise.resolve(WNIOSEK);
    if (sciezka === "/me") return Promise.resolve({ role: "volunteer", first_name: "Marta" });
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`));
  });
}

async function wyrenderuj(element: () => React.ReactElement, czekajNa: (ekran: typeof import("@testing-library/react").screen) => Promise<unknown>) {
  const { act, render, screen } = await import("@testing-library/react");
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(element());
  });
  await czekajNa(screen);
  // Identyfikatory z `useId` rosną z każdym renderem w tym samym procesie — porównanie DOM pomija ich numer.
  const html = wynik!.container.innerHTML.replace(/_r_[0-9a-z]+_/g, "_r_");
  const liczbaMain = wynik!.container.querySelectorAll("main").length;
  wynik!.unmount();
  return { html, liczbaMain };
}

describe("/panel/profil-psychologa a rejestr przełączenia", () => {
  it("rejestr: grupa włączona, ten sam adres starej i nowej trasy, ekran poligonu w rejestrze", () => {
    expect(GRUPY.profilPsychologa.wlaczona).toBe(true);
    expect(GRUPY.profilPsychologa.ekrany).toEqual([
      {
        panel: "uczestnik",
        staraTrasa: "/panel/profil-psychologa",
        nowaTrasa: "/panel/profil-psychologa",
        trasaPoligonu: "/nowy-front/profil-psychologa",
      },
    ]);
    expect(czyTrasaWNowejRamce("/panel/profil-psychologa", "uczestnik")).toBe(true);
  });

  it("grupa wyłączona: strona zwraca starą treść", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    expect((Strona() as { type: unknown }).type).toBe(StaraTresc);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu", async () => {
    podmienRejestr({ profilPsychologa: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    expect((Strona() as { type: unknown }).type).toBe(NowyEkran);
  });

  it("tytuł strony jest ten sam niezależnie od grupy", async () => {
    podmienRejestr({});
    const wylaczona = (await import("../page")).metadata;
    podmienRejestr({ profilPsychologa: true });
    const wlaczona = (await import("../page")).metadata;

    expect(wylaczona.title).toBe("Profil psychologa — Niepodzielni");
    expect(wlaczona.title).toBe(wylaczona.title);
  });

  it("grupa wyłączona: DOM strony jest bit w bit DOM-em samej starej treści (ładowanie i dane)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    api.mockImplementation(() => new Promise(() => {}));
    const ladowanieStrony = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Wczytywanie…"));
    const ladowanieStarej = await wyrenderuj(() => <StaraTresc />, (ekran) => ekran.findByText("Wczytywanie…"));
    expect(ladowanieStrony.html).toBe(ladowanieStarej.html);

    atrapaZWnioskiem();
    const daneStrony = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByRole("button", { name: "Złóż wniosek" }));
    const daneStarej = await wyrenderuj(() => <StaraTresc />, (ekran) => ekran.findByRole("button", { name: "Złóż wniosek" }));
    expect(daneStrony.html).toBe(daneStarej.html);
    expect(daneStrony.html).not.toContain("Stan wniosku");
  });

  it("grupa włączona: ta sama strona pokazuje ekran nowego frontu bez własnego main, nie starą treść", async () => {
    podmienRejestr({ profilPsychologa: true });
    const { default: Strona } = await import("../page");
    atrapaZWnioskiem();

    const { html, liczbaMain } = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByRole("heading", { level: 2, name: "Stan wniosku" }));
    expect(html).toContain("Wersja robocza");
    expect(html).toContain("Wyślij do sprawdzenia");
    expect(html).not.toContain("Złóż wniosek");
    expect(liczbaMain).toBe(0);
  });
});
