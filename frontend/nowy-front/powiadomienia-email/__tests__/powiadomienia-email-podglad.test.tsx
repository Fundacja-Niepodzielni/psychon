import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zakładka „Wysłane”: licznik „N łącznie”, czas wiersza z `created_at`, gdy
 * `sent_at` jest pusty, oraz okno „Podgląd” z treścią wiadomości. Treść
 * (`body_html`) trafia wyłącznie do ramki `iframe` z pustym `sandbox` przez
 * `srcDoc` — żaden skrypt z treści się nie wykonuje i żaden element z treści
 * nie trafia do dokumentu ekranu.
 */

const fetchAdminEmailsPage = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/h16-emails", () => ({
  fetchAdminEmailsPage: (...args: unknown[]) => fetchAdminEmailsPage(...args),
}));
vi.mock("@/lib/api/h16-ustawienia", () => ({
  fetchNotificationSettings: vi.fn().mockResolvedValue({
    types: [{ type: "course.unlocked", enabled: true }],
    supervision_reminder: { enabled: true, send_at: "08:00" },
  }),
  updateNotificationSettings: vi.fn(),
}));

const { PowiadomieniaEmail } = await import("../PowiadomieniaEmail");

const TRESC_ZLOSLIWA =
  '<p>Cześć Marto</p><img src="x" onerror="alert(1)"><script>window.__wykonano = true;</script>';

const PIERWSZA = {
  id: 1,
  to_email: "marta@demo.pl",
  subject: "Twój wpis stażu został zaakceptowany",
  body_html: TRESC_ZLOSLIWA,
  status: "simulated" as const,
  sent_at: "2026-09-25T15:05:00Z",
  created_at: "2026-09-25T15:00:00Z",
};
const DRUGA = {
  id: 2,
  to_email: "filip@demo.pl",
  subject: "Odblokowano kolejny etap",
  body_html: "",
  status: "queued" as const,
  sent_at: null,
  created_at: "2026-09-26T09:30:00Z",
};

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [PIERWSZA, DRUGA],
    meta: {
      current_page: 1,
      per_page: 25,
      total: 30,
      last_page: 2,
      extra: { from: { address: "powiadomienia@niepodzielni.test", name: "Niepodzielni" } },
    },
  });
  delete (window as unknown as { __wykonano?: boolean }).__wykonano;
});

async function otworzWyslane() {
  const uzytkownik = userEvent.setup();
  render(<PowiadomieniaEmail />);
  await uzytkownik.click(await screen.findByRole("button", { name: "Wysłane" }));
  await screen.findByText("marta@demo.pl");
  return uzytkownik;
}

describe("PowiadomieniaEmail — zakładka „Wysłane”", () => {
  it("pokazuje łączną liczbę wiadomości z meta.total", async () => {
    await otworzWyslane();

    expect(screen.getByText("30 łącznie")).toBeInTheDocument();
  });

  it("czas wiersza bez sent_at pochodzi z created_at, a nie jest kreską", async () => {
    await otworzWyslane();

    expect(screen.getByText("25 września 2026, 17:05")).toBeInTheDocument();
    expect(screen.getByText("26 września 2026, 11:30")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("każdy wiersz ma przycisk „Podgląd” z nazwą wskazującą temat", async () => {
    await otworzWyslane();

    expect(screen.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Podgląd: Odblokowano kolejny etap" })).toBeInTheDocument();
  });
});

describe("PowiadomieniaEmail — okno „Podgląd”", () => {
  it("pokazuje temat, Od, Do i Wysłano oraz treść w ramce z pustym sandbox", async () => {
    const uzytkownik = await otworzWyslane();

    await uzytkownik.click(screen.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" }));

    const okno = await screen.findByRole("dialog", { name: "Podgląd wiadomości — Twój wpis stażu został zaakceptowany" });
    expect(okno).toHaveAttribute("aria-modal", "true");
    expect(within(okno).getByText("Od:")).toBeInTheDocument();
    expect(within(okno).getByText("Niepodzielni <powiadomienia@niepodzielni.test>")).toBeInTheDocument();
    expect(within(okno).getByText("Do:")).toBeInTheDocument();
    expect(within(okno).getByText("marta@demo.pl")).toBeInTheDocument();
    expect(within(okno).getByText("Wysłano:")).toBeInTheDocument();
    expect(within(okno).getByText("25 września 2026, 17:05")).toBeInTheDocument();

    const ramka = okno.querySelector("iframe");
    expect(ramka).not.toBeNull();
    expect(ramka!.hasAttribute("sandbox")).toBe(true);
    expect(ramka!.getAttribute("sandbox")).toBe("");
    expect(ramka!.getAttribute("sandbox") ?? "").not.toMatch(/allow-scripts|allow-same-origin/);
    expect(ramka!.getAttribute("srcdoc")).toBe(TRESC_ZLOSLIWA);
    expect(ramka).toHaveAttribute("title", "Treść wiadomości");
  });

  it("treść z body_html nie trafia do dokumentu ekranu i nie wykonuje skryptu", async () => {
    const uzytkownik = await otworzWyslane();

    await uzytkownik.click(screen.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" }));
    await screen.findByRole("dialog");

    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByText("Cześć Marto")).toBeNull();
    expect((window as unknown as { __wykonano?: boolean }).__wykonano).toBeUndefined();
  });

  it("wiadomość bez treści mówi „Brak treści.” zamiast pustej ramki", async () => {
    const uzytkownik = await otworzWyslane();

    await uzytkownik.click(screen.getByRole("button", { name: "Podgląd: Odblokowano kolejny etap" }));

    const okno = await screen.findByRole("dialog");
    expect(within(okno).getByText("Brak treści.")).toBeInTheDocument();
    expect(okno.querySelector("iframe")).toBeNull();
    expect(within(okno).getByText("26 września 2026, 11:30")).toBeInTheDocument();
  });

  it("Esc zamyka okno i oddaje fokus przyciskowi, który je otworzył", async () => {
    const uzytkownik = await otworzWyslane();
    const przycisk = screen.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" });

    await uzytkownik.click(przycisk);
    await screen.findByRole("dialog");
    await uzytkownik.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(przycisk).toHaveFocus();
  });

  it("przycisk „Zamknij podgląd” zamyka okno", async () => {
    const uzytkownik = await otworzWyslane();

    await uzytkownik.click(screen.getByRole("button", { name: "Podgląd: Odblokowano kolejny etap" }));
    await uzytkownik.click(await screen.findByRole("button", { name: "Zamknij podgląd" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("bez skonfigurowanego nadawcy pole Od mówi o tym wprost", async () => {
    fetchAdminEmailsPage.mockResolvedValue({
      data: [PIERWSZA],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { from: null } },
    });
    const uzytkownik = await otworzWyslane();

    await uzytkownik.click(screen.getByRole("button", { name: /Podgląd:/ }));

    const okno = await screen.findByRole("dialog");
    expect(within(okno).getByText("brak skonfigurowanego nadawcy")).toBeInTheDocument();
  });
});
