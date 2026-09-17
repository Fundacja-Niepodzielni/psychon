import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek wspólnego ekranu odmowy (Forbidden403 + RequireRole) na czterech
 * ekranach panelu uczestnika (certyfikat, staż, superwizja, profil-psychologa).
 * Wszystkie cztery mają jednakową rolę dopuszczoną ("volunteer") i własne
 * zdanie objaśniające wpisane literałem w layout.tsx (nie ma modułu słownika
 * interfejsu) — mierzymy LICZBĘ wyrenderowanych ekranów odmowy i zgodność
 * treści między nimi, a nie samą obecność jednego z elementów.
 */

const api = vi.fn();

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const { default: CertyfikatLayout } = await import(
  "@/app/(uczestnik)/panel/certyfikat/layout"
);
const { default: StazLayout } = await import("@/app/(uczestnik)/panel/staz/layout");
const { default: SuperwizjaLayout } = await import(
  "@/app/(uczestnik)/panel/superwizja/layout"
);
const { default: ProfilPsychologaLayout } = await import(
  "@/app/(uczestnik)/panel/profil-psychologa/layout"
);

const EKRANY = [
  { nazwa: "certyfikat", Layout: CertyfikatLayout },
  { nazwa: "staż", Layout: StazLayout },
  { nazwa: "superwizja", Layout: SuperwizjaLayout },
  { nazwa: "profil-psychologa", Layout: ProfilPsychologaLayout },
] as const;

const TRESC_CHRONIONA = "Treść chroniona ekranu";

beforeEach(() => {
  api.mockReset();
});

describe("wspólny ekran odmowy na czterech ekranach panelu uczestnika", () => {
  it.each(EKRANY)(
    "$nazwa: rola bez dostępu (student) dostaje dokładnie jeden ekran 403 z kompletem pól",
    async ({ Layout }) => {
      api.mockResolvedValue({ role: "student" });

      render(
        <Layout>
          <div>{TRESC_CHRONIONA}</div>
        </Layout>,
      );

      await waitFor(() =>
        expect(screen.getAllByText("Brak dostępu")).toHaveLength(1),
      );

      // Struktura: nagłówek, oznaczenie błędu, wiersze ról, odnośnik powrotu —
      // liczone, nie tylko sprawdzane na obecność.
      expect(screen.getAllByText("Błąd 403")).toHaveLength(1);
      expect(screen.getAllByText("Twoja rola:")).toHaveLength(1);
      expect(screen.getByText("Twoja rola:").nextElementSibling).toHaveTextContent(
        "Student",
      );
      expect(screen.getAllByText("Wymagana rola:")).toHaveLength(1);
      expect(
        screen.getByText("Wymagana rola:").nextElementSibling,
      ).toHaveTextContent("Wolontariusz");
      expect(
        screen.getAllByRole("link", { name: "Wróć na stronę główną" }),
      ).toHaveLength(1);

      // Noga negatywna: treść chronionego ekranu się NIE renderuje.
      expect(screen.queryByText(TRESC_CHRONIONA)).not.toBeInTheDocument();
    },
  );

  it.each(EKRANY)(
    "$nazwa: rola z dostępem (volunteer) renderuje dzieci, zero ekranów 403",
    async ({ Layout }) => {
      api.mockResolvedValue({ role: "volunteer" });

      render(
        <Layout>
          <div>{TRESC_CHRONIONA}</div>
        </Layout>,
      );

      await waitFor(() =>
        expect(screen.getByText(TRESC_CHRONIONA)).toBeInTheDocument(),
      );
      expect(screen.queryAllByText("Brak dostępu")).toHaveLength(0);
      expect(screen.queryAllByText("Błąd 403")).toHaveLength(0);
    },
  );

  it("zdanie objaśniające jest identyczne na wszystkich czterech ekranach (dokładnie jedno wspólne zdanie)", async () => {
    const zdania: string[] = [];

    for (const { Layout } of EKRANY) {
      api.mockResolvedValue({ role: "student" });
      const { unmount } = render(
        <Layout>
          <div>{TRESC_CHRONIONA}</div>
        </Layout>,
      );

      await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
      const akapit = screen
        .getByText("Brak dostępu")
        .closest("div")
        ?.querySelector("p.text-body");
      expect(akapit).toBeTruthy();
      zdania.push(akapit!.textContent ?? "");
      unmount();
    }

    // Cztery ekrany, cztery odczytane zdania, ale dokładnie JEDNA unikatowa
    // treść — rozjazd (jedno inne niż pozostałe trzy) ma zaczerwienić ten test.
    expect(zdania).toHaveLength(4);
    expect(new Set(zdania).size).toBe(1);
    expect(zdania[0]).toBe("Ta funkcja jest dostępna tylko dla wolontariuszek.");
  });
});
