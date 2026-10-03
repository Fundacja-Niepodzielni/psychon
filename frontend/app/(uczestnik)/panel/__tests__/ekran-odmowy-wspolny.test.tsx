import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek wspólnego ekranu odmowy nowej ramki (`EkranOdmowy`) na czterech ekranach panelu
 * uczestnika dla wolontariusza (certyfikat, staż, superwizja, profil psychologa). Student
 * wchodzący ręcznie pod któryś z czterech adresów dostaje ten sam ekran odmowy zamiast treści
 * ekranu — mierzymy LICZBĘ wyrenderowanych ekranów odmowy, zgodność treści między czterema
 * adresami, brak treści chronionej (formularza) i cel przycisku.
 */

const api = vi.fn();
const push = vi.fn();

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
vi.mock("@/lib/api/klient", () => ({ api: (...args: unknown[]) => api(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const { default: CertyfikatLayout } = await import("@/app/(uczestnik)/panel/certyfikat/layout");
const { default: StazLayout } = await import("@/app/(uczestnik)/panel/staz/layout");
const { default: SuperwizjaLayout } = await import("@/app/(uczestnik)/panel/superwizja/layout");
const { default: ProfilPsychologaLayout } = await import("@/app/(uczestnik)/panel/profil-psychologa/layout");

const { default: CertyfikatStrona } = await import("@/app/(uczestnik)/panel/certyfikat/page");
const { default: StazStrona } = await import("@/app/(uczestnik)/panel/staz/page");
const { default: SuperwizjaStrona } = await import("@/app/(uczestnik)/panel/superwizja/page");
const { default: ProfilPsychologaStrona } = await import("@/app/(uczestnik)/panel/profil-psychologa/page");

const EKRANY = [
  { nazwa: "certyfikat", Layout: CertyfikatLayout, Strona: CertyfikatStrona },
  { nazwa: "staż", Layout: StazLayout, Strona: StazStrona },
  { nazwa: "superwizja", Layout: SuperwizjaLayout, Strona: SuperwizjaStrona },
  { nazwa: "profil-psychologa", Layout: ProfilPsychologaLayout, Strona: ProfilPsychologaStrona },
] as const;

const TRESC_CHRONIONA = "Treść chroniona ekranu";
const NAGLOWEK = "Nie masz dostępu do tego ekranu";

beforeEach(() => {
  api.mockReset();
  push.mockReset();
});

describe("wspólny ekran odmowy (EkranOdmowy) na czterech ekranach panelu uczestnika", () => {
  it.each(EKRANY)(
    "$nazwa: student dostaje dokładnie jeden ekran odmowy z rolą i jednym przyciskiem, bez treści ekranu",
    async ({ Layout }) => {
      api.mockResolvedValue({ role: "student", first_name: "Ola" });

      render(
        <Layout>
          <form aria-label="Formularz ekranu">
            <div>{TRESC_CHRONIONA}</div>
          </form>
        </Layout>,
      );

      expect(await screen.findAllByRole("heading", { level: 1, name: NAGLOWEK })).toHaveLength(1);
      expect(await screen.findByText("Twoja rola: Student. Ten ekran jest dla wolontariuszy.")).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Wróć do pulpitu" })).toBeInTheDocument();

      // Noga negatywna: ani treść, ani formularz chronionego ekranu, ani stary ekran „Błąd 403”.
      expect(screen.queryByText(TRESC_CHRONIONA)).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Formularz ekranu" })).not.toBeInTheDocument();
      expect(screen.queryByText("Błąd 403")).not.toBeInTheDocument();
      expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
    },
  );

  it.each(EKRANY)(
    "$nazwa: prawdziwa strona pod bramką nie pobiera niczego poza kontem, gdy rolą jest student",
    async ({ Layout, Strona }) => {
      api.mockResolvedValue({ role: "student", first_name: "Ola" });

      render(
        <Layout>
          <Strona />
        </Layout>,
      );

      expect(await screen.findByRole("heading", { level: 1, name: NAGLOWEK })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      const adresy = api.mock.calls.map((wywolanie) => wywolanie[0]);
      expect(adresy.length).toBeGreaterThan(0);
      expect(adresy.every((adres) => adres === "/me"), `żądania: ${JSON.stringify(adresy)}`).toBe(true);
    },
  );

  it.each(EKRANY)("$nazwa: przycisk odmowy prowadzi do pulpitu", async ({ Layout }) => {
    api.mockResolvedValue({ role: "student" });

    render(
      <Layout>
        <div>{TRESC_CHRONIONA}</div>
      </Layout>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/panel/pulpit");
  });

  it.each(EKRANY)("$nazwa: wolontariusz widzi treść ekranu, zero ekranów odmowy", async ({ Layout }) => {
    api.mockResolvedValue({ role: "volunteer" });

    render(
      <Layout>
        <div>{TRESC_CHRONIONA}</div>
      </Layout>,
    );

    await waitFor(() => expect(screen.getByText(TRESC_CHRONIONA)).toBeInTheDocument());
    expect(screen.queryAllByRole("heading", { name: NAGLOWEK })).toHaveLength(0);
  });

  it("treść odmowy jest identyczna na wszystkich czterech ekranach (jedno wspólne zdanie)", async () => {
    const teksty: string[] = [];

    for (const { Layout } of EKRANY) {
      api.mockResolvedValue({ role: "student" });
      const { container, unmount } = render(
        <Layout>
          <div>{TRESC_CHRONIONA}</div>
        </Layout>,
      );

      await screen.findByText("Twoja rola: Student. Ten ekran jest dla wolontariuszy.");
      teksty.push(container.textContent ?? "");
      unmount();
    }

    expect(teksty).toHaveLength(4);
    expect(new Set(teksty).size).toBe(1);
  });
});
