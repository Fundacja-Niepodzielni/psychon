import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Druga połowa wylogowania: UPUSZCZENIE TOKENÓW PO STRONIE APLIKACJI.
 *
 * Adres wylogowania realmu (patrz `app/api/auth/end-session-url`) zamyka
 * ciasteczko SSO. Tu mierzymy to, co musi się stać lokalnie: sesja Auth.js
 * kończy się (`signOut`) i podręczny cache tokenu w karcie przestaje go
 * oddawać. Dawniej to drugie czyściło tylko pamięć karty i zostawiało
 * ciasteczko sesji nietknięte — dlatego oba warunki są tu sprawdzane naraz.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

/**
 * Świeży `lib/api.ts` na każdy test: cache sesji jest modułowym stanem, więc
 * bez tego drugi test mierzyłby ślad po pierwszym.
 */
async function swiezyModul() {
  vi.resetModules();
  return import("@/lib/api");
}

function odpowiedzSesji(cialo: unknown, ok = true) {
  return { ok, json: async () => cialo };
}

beforeEach(() => {
  signOutMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zakończenie sesji upuszcza tokeny aplikacji", () => {
  it("endSession woła signOut i przestaje oddawać token z cache", async () => {
    const { endSession, getToken } = await swiezyModul();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        odpowiedzSesji({ accessToken: "token-abc", expiresAt: Date.now() + 600_000 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    // Sesja żyje: token jest i siedzi w cache (drugi odczyt nie pyta serwera).
    expect(await getToken()).toBe("token-abc");
    expect(await getToken()).toBe("token-abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await endSession();

    // 1. Ciasteczko sesji Auth.js zamknięte — nie sam cache w karcie.
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });

    // 2. Po wylogowaniu serwer nie zna już sesji; token nie wraca.
    fetchMock.mockResolvedValue(odpowiedzSesji(null, false));
    expect(await getToken()).toBeNull();
  });

  it("nieudana rotacja tokenu po stronie serwera kończy sesję w przeglądarce", async () => {
    const { getToken } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        odpowiedzSesji({
          accessToken: null,
          expiresAt: null,
          error: "RefreshAccessTokenError",
        }),
      ),
    );

    // Ciasteczko może jeszcze istnieć, ale sesja za nim jest martwa: aplikacja
    // ma ją zamknąć sama, a nie czekać na pierwsze 401 z API.
    expect(await getToken()).toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
  });

  it("KONTROLA NEGATYWNA: żywa sesja nie jest wylogowywana przy zwykłym odczycie", async () => {
    const { getToken } = await swiezyModul();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          odpowiedzSesji({ accessToken: "token-abc", expiresAt: Date.now() + 600_000 }),
        ),
    );

    expect(await getToken()).toBe("token-abc");
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
