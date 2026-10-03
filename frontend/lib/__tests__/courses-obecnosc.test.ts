import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Potwierdzenie obecności na webinarze (`POST /courses/{slug}/attendance`):
 * dokładnie jedno żądanie POST pod adres kursu, bez ciała, przez wspólny klient.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...args: unknown[]) => api(...args) };
});

const { confirmAttendance } = await import("../courses");

beforeEach(() => {
  api.mockReset();
});

describe("confirmAttendance", () => {
  it("woła POST pod /courses/{slug}/attendance, bez ciała i bez nagłówków", async () => {
    api.mockResolvedValue({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" });

    await expect(confirmAttendance("webinar-o-kryzysie")).resolves.toEqual({
      course_id: 12,
      attended_at: "2026-11-05T17:04:11Z",
    });

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/courses/webinar-o-kryzysie/attendance", { method: "POST" });
    const opcje = api.mock.calls[0][1] as Record<string, unknown>;
    expect(opcje).not.toHaveProperty("body");
  });

  it("slug jest kodowany jako jeden segment ścieżki", async () => {
    api.mockResolvedValue({ course_id: 1, attended_at: "2026-11-05T17:04:11Z" });
    await confirmAttendance("a/b c");
    expect(api).toHaveBeenCalledWith("/courses/a%2Fb%20c/attendance", { method: "POST" });
  });

  it("błąd serwera przechodzi bez zmian do wołającego", async () => {
    const blad = new Error("odmowa");
    api.mockRejectedValue(blad);
    await expect(confirmAttendance("webinar")).rejects.toBe(blad);
  });
});
