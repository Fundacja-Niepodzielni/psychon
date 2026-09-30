import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { KONTO_PO_PROGRAMIE, KONTO_STUDENTA, KONTO_WOLONTARIUSZA } from "./atrapy";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";

/**
 * Wybór pulpitu po roli z `GET /me`: wolontariusz → pulpit uczestnika,
 * student → pulpit kursów, inna rola → „brak dostępu”. Stany samego wyboru
 * (ładowanie, 403, 404, błąd sieci, inny błąd) stoją w szablonie tak samo jak
 * stany pulpitów. Pulpity są atrapą — ich stany mierzą własne testy.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKonto = vi.fn();
vi.mock("../dane", () => ({
  pobierzKonto: (...args: unknown[]) => pobierzKonto(...args),
}));

vi.mock("../PulpitUczestnika", () => ({
  PulpitUczestnika: ({ programUkonczony }: { programUkonczony: boolean }) => (
    <main id="tresc" tabIndex={-1} data-style-id="szablon-pulpit">
      pulpit-uczestnika-{String(programUkonczony)}
    </main>
  ),
}));
vi.mock("../PulpitStudenta", () => ({
  PulpitStudenta: () => (
    <main id="tresc" tabIndex={-1} data-style-id="szablon-pulpit">
      pulpit-studenta
    </main>
  ),
}));

const { Pulpit } = await import("../Pulpit");

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

beforeEach(() => {
  pobierzKonto.mockReset();
});

describe("Pulpit — wybór po roli", () => {
  it("wolontariusz → pulpit uczestnika z flagą programu (kontrola dodatnia: student dostaje inny pulpit)", async () => {
    pobierzKonto.mockResolvedValue(KONTO_WOLONTARIUSZA);
    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText("pulpit-uczestnika-false")).toBeInTheDocument());
    expect(screen.queryByText("pulpit-studenta")).not.toBeInTheDocument();
    cleanup();

    pobierzKonto.mockResolvedValue(KONTO_STUDENTA);
    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText("pulpit-studenta")).toBeInTheDocument());
    expect(screen.queryByText(/pulpit-uczestnika/)).not.toBeInTheDocument();
  });

  it("program zamknięty w /me trafia do pulpitu uczestnika (kontrola dodatnia: konto bez daty daje false)", async () => {
    pobierzKonto.mockResolvedValue(KONTO_PO_PROGRAMIE);
    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText("pulpit-uczestnika-true")).toBeInTheDocument());
  });

  it("inna rola → brak dostępu w szablonie, bez cudzego pulpitu (kontrola dodatnia: rola wolontariusza przechodzi)", async () => {
    pobierzKonto.mockResolvedValue({ ...KONTO_WOLONTARIUSZA, role: "instructor", roles: ["instructor"] });
    const { container } = render(<Pulpit />);
    await waitFor(() => expect(screen.getByText(/tylko dla uczestników/)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(screen.queryByText(/pulpit-/)).not.toBeInTheDocument();
  });

  it("ładowanie: szablon i szkielet przed odpowiedzią /me", () => {
    pobierzKonto.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Pulpit />);
    szablonPulpitu(container);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  const przypadki = [
    { nazwa: "403", wyjatek: blad(403, "forbidden"), tekst: /tylko dla uczestników/ },
    { nazwa: "404", wyjatek: blad(404, "not_found"), tekst: "Nie znaleziono danych pulpitu" },
    { nazwa: "błąd sieci", wyjatek: new TypeError("Failed to fetch"), tekst: "Brak połączenia" },
    { nazwa: "błąd serwera", wyjatek: blad(500, "server_error"), tekst: "Nie udało się wczytać pulpitu" },
  ];

  it.each(przypadki)("$nazwa odczytu /me: komunikat w szablonie, bez przycisku głównego", async ({ wyjatek, tekst }) => {
    pobierzKonto.mockRejectedValue(wyjatek);
    const { container } = render(<Pulpit />);
    await waitFor(() => expect(screen.getByText(tekst)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(0);
  });
});
