import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Próba w `EdytorTresciKursuProwadzacego.test.tsx`, dziś
 * „pozytyw: zapis treści przekazuje dane formularza do updateInstructorCourse…",
 * nazywała się wcześniej „zapis treści woła instructor-endpoint", ale
 * mockowała cały moduł `prowadzacy-kursy`
 * (`vi.mock("@/lib/api/prowadzacy-kursy")`) — dowód: podmiana wszystkich
 * 14 wystąpień `/instructor/` na `/admin/` w `lib/api/prowadzacy-kursy.ts`
 * zostawiała 6/6 zielonych, bo atrapa nigdy nie czytała prawdziwego adresu.
 *
 * Tu atrapa siedzi piętro niżej — na `fetch` — więc próba czyta adres i
 * metodę, z którą prawdziwy `api()`/`request()` (`lib/api/klient.ts`)
 * naprawdę woła. Moduł `prowadzacy-kursy` NIE jest mockowany.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

async function freshModule() {
  vi.resetModules();
  return import("@/lib/api/prowadzacy-kursy");
}

function sessionResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ accessToken: "token-test", expiresAt: Date.now() + 600_000 }),
  };
}

function apiResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

/** Ostatnie wywołanie `fetch`, które NIE poszło do `/api/auth/session`. */
function ostatnieWywolanieApi(fetchMock: ReturnType<typeof vi.fn>) {
  const wolania = fetchMock.mock.calls.filter(
    (wywolanie: unknown[]) => !String(wywolanie[0]).includes("/api/auth/session"),
  );
  return wolania[wolania.length - 1] as [RequestInfo | URL, RequestInit | undefined];
}

beforeEach(() => {
  signOutMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prowadzacy-kursy — adres i metoda wywołania (nie atrapa modułu)", () => {
  it.each([
    {
      nazwa: "fetchInstructorCourse czyta GET /instructor/courses/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) => m.fetchInstructorCourse(4),
      metoda: undefined,
      adres: "/instructor/courses/4",
    },
    {
      nazwa: "updateInstructorCourse woła PATCH /instructor/courses/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.updateInstructorCourse(4, { title: "Nowy tytuł" }),
      metoda: "PATCH",
      adres: "/instructor/courses/4",
    },
    {
      nazwa: "fetchInstructorLessons czyta GET /instructor/courses/{id}/lessons",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) => m.fetchInstructorLessons(4),
      metoda: undefined,
      adres: "/instructor/courses/4/lessons",
    },
    {
      nazwa: "createInstructorLesson woła POST /instructor/courses/{id}/lessons",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.createInstructorLesson(4, { title: "Lekcja" }),
      metoda: "POST",
      adres: "/instructor/courses/4/lessons",
    },
    {
      nazwa: "updateInstructorLesson woła PATCH /instructor/lessons/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.updateInstructorLesson(7, { title: "Lekcja" }),
      metoda: "PATCH",
      adres: "/instructor/lessons/7",
    },
    {
      nazwa: "deleteInstructorLesson woła DELETE /instructor/lessons/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) => m.deleteInstructorLesson(7),
      metoda: "DELETE",
      adres: "/instructor/lessons/7",
    },
    {
      nazwa: "uploadInstructorMaterialForCourse woła POST /instructor/courses/{id}/materials",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.uploadInstructorMaterialForCourse(4, new File(["x"], "a.pdf")),
      metoda: "POST",
      adres: "/instructor/courses/4/materials",
    },
    {
      nazwa: "uploadInstructorMaterialForLesson woła POST /instructor/lessons/{id}/materials",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.uploadInstructorMaterialForLesson(7, new File(["x"], "a.pdf")),
      metoda: "POST",
      adres: "/instructor/lessons/7/materials",
    },
    {
      nazwa: "deleteInstructorMaterial woła DELETE /instructor/materials/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) => m.deleteInstructorMaterial(9),
      metoda: "DELETE",
      adres: "/instructor/materials/9",
    },
    {
      nazwa: "fetchInstructorTest czyta GET /instructor/courses/{id}/tests",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) => m.fetchInstructorTest(4),
      metoda: undefined,
      adres: "/instructor/courses/4/tests",
    },
    {
      nazwa: "createInstructorTest woła POST /instructor/courses/{id}/tests",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.createInstructorTest(4, { pass_threshold: 80 }),
      metoda: "POST",
      adres: "/instructor/courses/4/tests",
    },
    {
      nazwa: "updateInstructorTest woła PATCH /instructor/tests/{id}",
      wywolaj: (m: typeof import("@/lib/api/prowadzacy-kursy")) =>
        m.updateInstructorTest(11, { attempts_limit: 3 }),
      metoda: "PATCH",
      adres: "/instructor/tests/11",
    },
  ])("$nazwa", async ({ wywolaj, metoda, adres }) => {
    const modul = await freshModule();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/session")) return sessionResponse();
      return apiResponse({ id: 1 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await wywolaj(modul);

    const [wolanyAdres, init] = ostatnieWywolanieApi(fetchMock);
    expect(String(wolanyAdres)).toContain(adres);
    if (metoda) expect(init?.method).toBe(metoda);
  });
});
