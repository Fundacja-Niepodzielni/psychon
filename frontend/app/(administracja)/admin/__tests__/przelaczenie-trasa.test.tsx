import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Strona startowa administracji `/admin` czyta rejestr przełączenia (grupa
 * `pulpitAdministracji`): przy grupie wyłączonej zwraca dokładnie starą treść
 * (`StaraTresc`), przy włączonej — ekran nowego frontu owinięty w dostawcę
 * powłoki. Adres jest ten sam w obu stanach, więc nic nie przekierowuje.
 */

const api = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => api(...args) };
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const PULPIT = {
  counters: { participants: 137, completed: 29, certificates: 23 },
  queues: [{ key: "applications", count: 11, link: "/admin/uczestniczki" }],
};

type Korzen = { type: unknown; props: { children: { type: unknown; props: { children: { type: unknown } } } } };

afterEach(() => {
  api.mockReset();
  przywrocRejestr();
});

describe("strona /admin a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca starą treść i nie owija jej w nic", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    expect((Strona() as { type: unknown }).type).toBe(StaraTresc);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu w dostawcy powłoki", async () => {
    podmienRejestr({ pulpitAdministracji: true });
    const { default: Strona } = await import("../page");
    const { DostawcaPowloki } = await import("@/design-system/szablony/KontekstPowloki");
    const { PulpitAdministracji } = await import("@/nowy-front/pulpit-administracji/PulpitAdministracji");

    const korzen = Strona() as unknown as Korzen;
    expect(korzen.type).toBe("div");
    expect(korzen.props.children.type).toBe(DostawcaPowloki);
    expect(korzen.props.children.props.children.type).toBe(PulpitAdministracji);
  });

  it("ten sam test na obu stanach: wyłączona renderuje bit w bit starą treść, włączona inną", async () => {
    api.mockResolvedValue(PULPIT);

    podmienRejestr({});
    const wylaczona = await import("../page");
    const stara = await import("../StaraTresc");
    const zWylaczona = render(<wylaczona.default />);
    await screen.findByText("137");
    const htmlStrony = zWylaczona.container.innerHTML;
    zWylaczona.unmount();
    const zStarej = render(<stara.default />);
    await screen.findByText("137");
    expect(htmlStrony).toBe(zStarej.container.innerHTML);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pulpit");
    zStarej.unmount();

    przywrocRejestr();
    podmienRejestr({ pulpitAdministracji: true });
    const wlaczona = await import("../page");
    const zWlaczona = render(<wlaczona.default />);
    await screen.findByText("137");
    expect(zWlaczona.container.innerHTML).not.toBe(htmlStrony);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pulpit administracji");
  });
});
