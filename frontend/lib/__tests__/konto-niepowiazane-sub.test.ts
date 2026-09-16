import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Świadek `checkAccountBinding()` (`lib/api.ts`) — funkcja czyta WPROST
 * (surowy `fetch`, nie `request()`) kopertę 401 z dowolnej trasy biznesowej
 * i wyciąga z niej `error.code`/`error.reason.sub`.
 *
 * K1 — koperta kontraktu §1 `{"error":{"code":"konto_niepowiazane",
 * "reason":{"sub":"…"}}}` (kształt z rozstrzygnięcia lidera 16.09 13:5x,
 * `KRYTERIA-OD-108-ddb52ad.md`) → funkcja zwraca DOKŁADNIE tę wartość `sub`.
 * K3 — kontrola negatywna: token nieważny, `error.code === "unauthenticated"`,
 * BRAK `error.reason.sub` → funkcja nie zwraca identyfikatora. Zmienia się
 * jedna ścieżka (K1), nie obie.
 * K4 — identyfikator nie trafia do `console.log`/`console.error` po drodze.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

async function swiezyModul() {
  vi.resetModules();
  return import("@/lib/api");
}

/** Fetch atrapa: sesja Auth.js zawsze ważna, `/me` odpowiada wg `odpowiedzMe`. */
function zbudujFetch(odpowiedzMe: { status: number; body: unknown }) {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/auth/session")) {
      return {
        ok: true,
        json: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 600_000 }),
      };
    }
    return {
      ok: odpowiedzMe.status >= 200 && odpowiedzMe.status < 300,
      status: odpowiedzMe.status,
      json: async () => odpowiedzMe.body,
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SUB_Z_TOKENA = "88522d2e-aaaa-bbbb-cccc-111122223333";

describe("checkAccountBinding — K1: koperta kontraktu §1 z sub", () => {
  it("zwraca code=konto_niepowiazane i DOKŁADNIE ten sam sub co w error.reason.sub", async () => {
    const { checkAccountBinding } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      zbudujFetch({
        status: 401,
        body: {
          error: {
            status: 401,
            code: "konto_niepowiazane",
            message: "To konto nie jest jeszcze powiązane…",
            reason: { sub: SUB_Z_TOKENA },
          },
        },
      }),
    );

    const wynik = await checkAccountBinding();
    expect(wynik).toEqual({ code: "konto_niepowiazane", sub: SUB_Z_TOKENA });
  });

  it("nie loguje identyfikatora do konsoli (K4)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { checkAccountBinding } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      zbudujFetch({
        status: 401,
        body: {
          error: {
            status: 401,
            code: "konto_niepowiazane",
            message: "To konto nie jest jeszcze powiązane…",
            reason: { sub: SUB_Z_TOKENA },
          },
        },
      }),
    );

    await checkAccountBinding();

    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("checkAccountBinding — K3: kontrola negatywna, token nieważny", () => {
  it("error.code=unauthenticated bez reason.sub → sub nieobecny", async () => {
    const { checkAccountBinding } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      zbudujFetch({
        status: 401,
        body: { error: { status: 401, code: "unauthenticated", message: "Brak sesji." } },
      }),
    );

    const wynik = await checkAccountBinding();
    expect(wynik?.code).toBe("unauthenticated");
    expect(wynik?.sub).toBeUndefined();
  });

  it("trasa odpowiada 200 (konto jednak powiązane) → null, nie błąd", async () => {
    const { checkAccountBinding } = await swiezyModul();
    vi.stubGlobal("fetch", zbudujFetch({ status: 200, body: { data: { role: "volunteer" } } }));

    const wynik = await checkAccountBinding();
    expect(wynik).toBeNull();
  });
});

describe("checkAccountBinding — ZLECENIE-127 K1: awaria zamiast 401", () => {
  it("fetch odrzuca obietnicę (błąd sieci) → code KONTO_BINDING_AWARIA, nie null", async () => {
    const { checkAccountBinding, KONTO_BINDING_AWARIA } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/auth/session")) {
          return {
            ok: true,
            json: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 600_000 }),
          };
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    const wynik = await checkAccountBinding();
    expect(wynik).toEqual({ code: KONTO_BINDING_AWARIA });
  });

  it("/me odpowiada 500 → code KONTO_BINDING_AWARIA, nie ekran dotychczasowy (null)", async () => {
    const { checkAccountBinding, KONTO_BINDING_AWARIA } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      zbudujFetch({ status: 500, body: { error: { status: 500, code: "server_error" } } }),
    );

    const wynik = await checkAccountBinding();
    expect(wynik).toEqual({ code: KONTO_BINDING_AWARIA });
  });
});
