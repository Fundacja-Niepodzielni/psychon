import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Żądania ekranu są dokładnie tymi, które wykonuje stary komponent (`POMIAR-STAREGO-EKRANU.md`): te
 * same trasy, metody i ciała. Kontrole dodatnie: każda trasa wołana raz, z oczekiwanymi argumentami.
 */

const api = vi.fn();
const apiPaged = vi.fn();
vi.mock("@/lib/api/klient", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

const dane = await import("../dane");
const { GRUPA, RZETELNOSC, TERMIN_PRZYSZLY } = await import("./atrapy");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("żądania grupy prowadzącego", () => {
  it("grupa: GET /instructor/group", async () => {
    api.mockResolvedValue(GRUPA);
    expect(await dane.pobierzGrupe()).toBe(GRUPA);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/instructor/group");
  });

  it("rzetelność: GET /instructor/reliability, tylko pole data", async () => {
    apiPaged.mockResolvedValue({ data: RZETELNOSC, meta: { current_page: 1, per_page: 25, total: 3, last_page: 1 } });
    expect(await dane.pobierzRzetelnosc()).toBe(RZETELNOSC);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith("/instructor/reliability");
  });

  it("termin: POST z czasem jako ISO UTC, liczbami i miejscem albo null", async () => {
    api.mockResolvedValue(TERMIN_PRZYSZLY);
    await dane.utworzTermin({ start: "2026-10-20T18:00", czas: "75", miejsca: "4", miejsce: "" });
    await dane.utworzTermin({ start: "2026-10-20T18:00", czas: "90", miejsca: "3", miejsce: "sala 4" });

    expect(api).toHaveBeenNthCalledWith(1, "/instructor/slots", {
      method: "POST",
      body: {
        starts_at: new Date("2026-10-20T18:00").toISOString(),
        duration_minutes: 75,
        seats_limit: 4,
        location_or_link: null,
      },
    });
    expect(api.mock.calls[1][1].body.location_or_link).toBe("sala 4");
    expect(typeof api.mock.calls[0][1].body.duration_minutes).toBe("number");
  });

  it("obecności: PATCH z mapą identyfikator osoby → wartość", async () => {
    api.mockResolvedValue(TERMIN_PRZYSZLY);
    await dane.zapiszObecnosci(30, { "17": "present", "18": "absent" });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/instructor/slots/30/attendance", {
      method: "PATCH",
      body: { attendance: { "17": "present", "18": "absent" } },
    });
  });

  it("sprawa: POST z tematem, opisem i osobą jako liczbą albo null", async () => {
    api.mockResolvedValue({});
    await dane.zglosSprawe({ osoba: "17", temat: "Temat", opis: "Opis" });
    await dane.zglosSprawe({ osoba: "", temat: "Temat", opis: "Opis" });
    expect(api).toHaveBeenNthCalledWith(1, "/instructor/cases", { method: "POST", body: { subject: "Temat", body: "Opis", volunteer_id: 17 } });
    expect(api.mock.calls[1][1].body.volunteer_id).toBeNull();
  });

  it("limity z żądań serwera: temat 255, opis 5000", () => {
    expect(dane.LIMIT_TEMATU).toBe(255);
    expect(dane.LIMIT_OPISU).toBe(5000);
  });
});
