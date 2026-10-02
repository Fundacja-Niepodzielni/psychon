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
const { odmowaKolejnosci, pobierzDaneLekcji, pobierzPytania, ukonczLekcje, wyslijPostep, wyslijPytanie } = await import("../dane");

const KOMUNIKAT = "Najpierw ukończ poprzednią lekcję.";

function odmowaApi(reason?: Record<string, unknown>) {
  return new ApiError({ status: 403, code: "lesson_locked", message: KOMUNIKAT, ...(reason ? { reason } : {}) });
}

const LEKCJA_SUROWA = {
  id: 22,
  title: "Druga lekcja",
  description: null,
  content: null,
  topic: null,
  duration_seconds: 600,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
  video_status: "ready" as const,
};

beforeEach(() => {
  apiMock.mockReset();
  apiPagedMock.mockReset();
});

describe("odmowaKolejnosci", () => {
  it("403 lesson_locked z `reason.required_lesson_id` → komunikat serwera i identyfikator wymaganej lekcji", () => {
    expect(odmowaKolejnosci(odmowaApi({ required_lesson_id: 21 }))).toEqual({
      odmowaKolejnosci: true,
      komunikat: KOMUNIKAT,
      wymaganaLekcjaId: 21,
    });
  });

  it.each([[undefined], [{}], [{ required_lesson_id: "21" }], [{ required_lesson_id: 0 }], [{ required_lesson_id: 1.5 }], [{ required_lesson_id: null }]])(
    "brak albo zły `reason` (%j) → wymaganaLekcjaId: null, komunikat zostaje",
    (reason) => {
      expect(odmowaKolejnosci(odmowaApi(reason as Record<string, unknown> | undefined))).toEqual({
        odmowaKolejnosci: true,
        komunikat: KOMUNIKAT,
        wymaganaLekcjaId: null,
      });
    },
  );

  it("inne odmowy i inne wyjątki → null", () => {
    expect(odmowaKolejnosci(new ApiError({ status: 403, code: "course_locked", message: "x" }))).toBeNull();
    expect(odmowaKolejnosci(new ApiError({ status: 404, code: "not_found", message: "x" }))).toBeNull();
    expect(odmowaKolejnosci(new Error("sieć"))).toBeNull();
    expect(odmowaKolejnosci(null)).toBeNull();
  });
});

describe("lekcja zamknięta kolejnością — żądania ekranu", () => {
  it("odczyt lekcji: status lekcja-zamknieta z identyfikatorem wymaganej lekcji", async () => {
    apiMock.mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));

    expect(await pobierzDaneLekcji("22")).toEqual({
      status: "lekcja-zamknieta",
      odmowaKolejnosci: true,
      komunikat: KOMUNIKAT,
      wymaganaLekcjaId: 21,
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("odczyt lekcji: sam kod bez `reason` → wymaganaLekcjaId: null", async () => {
    apiMock.mockRejectedValueOnce(odmowaApi());

    expect(await pobierzDaneLekcji("22")).toMatchObject({ status: "lekcja-zamknieta", wymaganaLekcjaId: null, komunikat: KOMUNIKAT });
  });

  it("odmowa dopiero przy linku nagrania → ten sam status", async () => {
    apiMock.mockResolvedValueOnce(LEKCJA_SUROWA).mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));

    expect(await pobierzDaneLekcji("22")).toMatchObject({ status: "lekcja-zamknieta", wymaganaLekcjaId: 21 });
  });

  it("zapis postępu: odmowa wraca jako odmowa kolejności, inne błędy jako null", async () => {
    const przyrosty = { watched_delta: 30, active_delta: 30, position_seconds: 30 };
    apiMock.mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));
    expect(await wyslijPostep("22", przyrosty)).toMatchObject({ odmowaKolejnosci: true, wymaganaLekcjaId: 21 });

    apiMock.mockRejectedValueOnce(new Error("sieć"));
    expect(await wyslijPostep("22", przyrosty)).toBeNull();
  });

  it("ukończenie: odmowa kolejności to osobny status", async () => {
    apiMock.mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));

    expect(await ukonczLekcje("22")).toEqual({
      status: "zamknieta",
      odmowa: { odmowaKolejnosci: true, komunikat: KOMUNIKAT, wymaganaLekcjaId: 21 },
    });
  });

  it("pytania: odczyt i wysłanie niosą odmowę kolejności", async () => {
    apiPagedMock.mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));
    expect(await pobierzPytania("22")).toMatchObject({ odmowaKolejnosci: true, wymaganaLekcjaId: 21 });

    apiMock.mockRejectedValueOnce(odmowaApi({ required_lesson_id: 21 }));
    expect(await wyslijPytanie("22", "Czy mogę?")).toMatchObject({ status: "zamknieta", odmowa: { wymaganaLekcjaId: 21 } });

    apiPagedMock.mockRejectedValueOnce(new Error("sieć"));
    expect(await pobierzPytania("22")).toBeNull();
  });
});
