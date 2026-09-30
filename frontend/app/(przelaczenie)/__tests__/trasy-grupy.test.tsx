import { afterEach, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Nowe trasy produktu w grupie tras `(przelaczenie)`: przy wyłączonej grupie
 * adres odpowiada jak na bazie (404), po włączeniu strona osadza ekran
 * nowego frontu za strażnikiem roli.
 */

type Blad = Error & { digest?: string };

function przechwycRzucony(funkcja: () => unknown): Blad | null {
  try {
    funkcja();
    return null;
  } catch (blad) {
    return blad as Blad;
  }
}

const TRASY = [
  {
    nazwa: "/panel/dalsza-wspolpraca",
    zaladuj: () => import("../panel/dalsza-wspolpraca/page"),
    role: ["volunteer", "student"],
  },
  {
    nazwa: "/admin/zgloszenia-wspolpracy",
    zaladuj: () => import("../admin/zgloszenia-wspolpracy/page"),
    role: ["project_manager", "super_admin"],
  },
] as const;

afterEach(() => {
  przywrocRejestr();
});

describe.each(TRASY)("nowa trasa produktu $nazwa", ({ zaladuj, role }) => {
  it("grupa wyłączona: adres kończy się notFound() jak na bazie", async () => {
    podmienRejestr({});
    const { default: Strona } = await zaladuj();

    const rzucony = przechwycRzucony(() => Strona());

    expect(rzucony?.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("grupa włączona: strona zwraca ekran za strażnikiem roli i nic nie rzuca", async () => {
    podmienRejestr({ wspolpraca: true });
    const { default: Strona } = await zaladuj();
    const RequireRole = (await import("@/components/permissions/RequireRole")).default;

    let element: unknown;
    const rzucony = przechwycRzucony(() => {
      element = Strona();
    });

    expect(rzucony).toBeNull();
    const korzen = element as { type: unknown; props: { allowedRoles: string[] } };
    expect(korzen.type).toBe(RequireRole);
    expect(korzen.props.allowedRoles).toEqual([...role]);
  });
});
