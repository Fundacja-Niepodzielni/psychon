import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek: wpis „korzeń sekcji" (Pulpit w administracji, Start
 * u prowadzącego) miał `href` będący prefiksem KAŻDEJ podstrony swojej
 * sekcji, więc `isActive` (dawne `pathname.startsWith(href + "/")`)
 * zapalał go razem z właściwym wpisem podstrony — dwa elementy
 * z `aria-current="page"` naraz zamiast jednego.
 */

let sciezka = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: vi.fn(),
    // PanelShell renderuje `NotificationBell`, który sam odpytuje listę
    // powiadomień — atrapa, żeby test mierzył wyłącznie zaznaczenie menu.
    apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  };
});

const PanelShell = (await import("@/components/layout/PanelShell")).default;
const { adminMenu } = await import("@/lib/menu/admin");
const { participantMenu } = await import("@/lib/menu/participant");
const { instructorMenu } = await import("@/lib/menu/instructor");

function ustawSciezke(nowa: string) {
  sciezka = nowa;
}

function renderShell(menu: typeof adminMenu) {
  return render(
    <PanelShell panelName="Panel testowy" menu={menu}>
      <p>treść</p>
    </PanelShell>,
  );
}

describe("PanelShell — jedno zaznaczenie menu naraz", () => {
  beforeEach(() => {
    sciezka = "/admin";
  });

  it("na podstronie administracji zaznaczony jest tylko jeden wpis", () => {
    ustawSciezke("/admin/kursy/5");
    renderShell(adminMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/kursy/i);
  });

  it("na pulpicie administracji zaznaczony jest tylko Pulpit", () => {
    ustawSciezke("/admin");
    renderShell(adminMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/pulpit/i);
  });

  it("na podstronie panelu uczestniczki zaznaczony jest tylko jeden wpis", () => {
    ustawSciezke("/panel/kursy/5");
    renderShell(participantMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/kursy/i);
  });

  it("na starcie panelu uczestniczki zaznaczony jest tylko Start", () => {
    ustawSciezke("/panel/start");
    renderShell(participantMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/start/i);
  });

  it("na podstronie panelu prowadzącego zaznaczony jest tylko jeden wpis", () => {
    ustawSciezke("/prowadzacy/grupa/3");
    renderShell(instructorMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/grupa/i);
  });

  it("na starcie panelu prowadzącego zaznaczony jest tylko Start", () => {
    ustawSciezke("/prowadzacy");
    renderShell(instructorMenu);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { current: "page" })).toHaveAccessibleName(/start/i);
  });
});
