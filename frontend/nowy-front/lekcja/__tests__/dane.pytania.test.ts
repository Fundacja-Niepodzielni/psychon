import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();
const apiPagedMock = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...original,
    api: (...args: unknown[]) => apiMock(...args),
    apiPaged: (...args: unknown[]) => apiPagedMock(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { pobierzPytania, wyslijPytanie, wyslijPostep } = await import("../dane");

const PYTANIE = {
  id: 1,
  lesson_id: 21,
  question: "Czy to działa?",
  answer: null,
  answered_by_name: null,
  answered_at: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: null,
};

beforeEach(() => {
  apiMock.mockReset();
  apiPagedMock.mockReset();
});

describe("pobierzPytania", () => {
  it("lista z odczytu pytań lekcji", async () => {
    apiPagedMock.mockResolvedValue({ data: [PYTANIE], meta: {} });

    expect(await pobierzPytania("21")).toEqual([PYTANIE]);
    expect(apiPagedMock).toHaveBeenCalledWith("/lessons/21/questions?per_page=100");
  });

  it("błąd odczytu → null, bez wyjątku", async () => {
    apiPagedMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await pobierzPytania("21")).toBeNull();
  });
});

describe("wyslijPytanie", () => {
  it("201 → pytanie z odpowiedzi", async () => {
    apiMock.mockResolvedValue(PYTANIE);

    expect(await wyslijPytanie("21", "Czy to działa?")).toEqual({ status: "ok", pytanie: PYTANIE });
    expect(apiMock).toHaveBeenCalledWith("/lessons/21/questions", { method: "POST", body: { question: "Czy to działa?" } });
  });

  it("422 z błędem pola: komunikat serwera", async () => {
    apiMock.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { question: ["Pytanie jest za długie."] },
      }),
    );

    expect(await wyslijPytanie("21", "x")).toEqual({ status: "blad", komunikat: "Pytanie jest za długie." });
  });

  it("inny błąd: zdanie ogólne", async () => {
    apiMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await wyslijPytanie("21", "x")).toEqual({
      status: "blad",
      komunikat: "Nie udało się wysłać pytania. Spróbuj ponownie.",
    });
  });
});

describe("wyslijPostep", () => {
  it("wysyła przyrosty i pozycję bezwzględną", async () => {
    const odpowiedz = { watched_seconds: 30, active_seconds: 30, completable: false, completable_at_percent: 60, required_active_seconds: 600 };
    apiMock.mockResolvedValue(odpowiedz);

    expect(await wyslijPostep("21", { watched_delta: 30, active_delta: 25, position_seconds: 784 })).toEqual(odpowiedz);
    expect(apiMock).toHaveBeenCalledWith("/lessons/21/progress", {
      method: "POST",
      body: { watched_delta: 30, active_delta: 25, position_seconds: 784 },
    });
  });

  it("błąd → null (przyrosty zostają u wołającego)", async () => {
    apiMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await wyslijPostep("21", { watched_delta: 1, active_delta: 1, position_seconds: 1 })).toBeNull();
  });
});
