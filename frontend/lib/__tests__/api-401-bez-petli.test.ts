import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Świadek rozróżnienia dwóch przyczyn 401 z dowolnej trasy biznesowej —
 * `handleUnauthorized` w `lib/api.ts`.
 *
 * Regresja, którą to zatrzymuje: `/logowanie` samo zaczyna logowanie przez
 * konto Niepodzielni, gdy nie ma sesji. Jeśli 401 zawsze kończyłoby sesję i
 * wracało na `/logowanie`, to dla ważnej sesji Kont, której `sub` nie jest
 * jeszcze powiązany z PsychON, przeglądarka wracałaby tam bez pytania o
 * cokolwiek — i znowu dostawałaby 401. Nieskończona pętla, bez ani jednego
 * ekranu, który dałoby się przeczytać.
 *
 * Rozróżnienie: `GET /sso/whoami` na tym samym tokenie. 200 → sesja ważna,
 * tylko niepowiązana → ekran `/logowanie/niepowiazane`, sesja NIE kończy się.
 * 401 (albo brak tokenu) → sesja naprawdę nieważna → `endSession()` i powrót
 * na `/logowanie`.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

async function swiezyModul() {
  vi.resetModules();
  return import("@/lib/api");
}

/** Fetch atrapa, która rozróżnia wywołania po adresie: sesja Auth.js,
 * `/sso/whoami` i dowolna trasa biznesowa (np. `/me`). */
function zbudujFetch(opcje: {
  wersjaWhoami: "200-bound" | "200-unbound" | "401";
  tokenWSesji?: string | null;
}) {
  const token = opcje.tokenWSesji ?? "token-abc";
  return vi.fn(async (url: string) => {
    if (url.includes("/api/auth/session")) {
      return {
        ok: true,
        json: async () => ({ accessToken: token, expiresAt: Date.now() + 600_000 }),
      };
    }
    if (url.includes("/sso/whoami")) {
      if (opcje.wersjaWhoami === "401") {
        return {
          ok: false,
          json: async () => ({ error: { status: 401, code: "unauthenticated", message: "Brak sesji." } }),
        };
      }
      return { ok: true, json: async () => ({ sub: "sub-123", roles: ["volunteer"] }) };
    }
    // Dowolna trasa biznesowa pod testem (`/me`) — zawsze 401, to jest bodziec.
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { status: 401, code: "unauthenticated", message: "Brak dostępu." } }),
    };
  });
}

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  signOutMock.mockClear();
  assign = vi.fn();
  prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, origin: "https://platforma.example.org" },
  });
});

afterEach(() => {
  if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
  vi.unstubAllGlobals();
});

describe("401: sesja Kont ważna, ale konto niepowiązane z PsychON", () => {
  it("ląduje na ekranie /logowanie/niepowiazane, NIGDY na /logowanie", async () => {
    const { api } = await swiezyModul();
    vi.stubGlobal("fetch", zbudujFetch({ wersjaWhoami: "200-unbound" }));

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const adres = String(assign.mock.calls[0][0]);
    expect(adres).toBe("https://platforma.example.org/logowanie/niepowiazane");
    expect(adres).not.toBe("https://platforma.example.org/logowanie");
  });

  it("NIE kończy sesji — dopiero przycisk na ekranie niepowiązania robi to sam", async () => {
    const { api } = await swiezyModul();
    vi.stubGlobal("fetch", zbudujFetch({ wersjaWhoami: "200-unbound" }));

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(signOutMock).not.toHaveBeenCalled();
  });
});

describe("401: sesja naprawdę nieważna", () => {
  it("kończy sesję i wraca na /logowanie, nie na ekran niepowiązania", async () => {
    const { api } = await swiezyModul();
    vi.stubGlobal("fetch", zbudujFetch({ wersjaWhoami: "401" }));

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    const adres = String(assign.mock.calls[0][0]);
    expect(adres).toBe("https://platforma.example.org/logowanie");
    expect(adres).not.toContain("niepowiazane");
  });
});
