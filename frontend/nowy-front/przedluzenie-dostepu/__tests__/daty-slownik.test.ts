import { describe, expect, it } from "vitest";
import { dataPoPrzedluzeniu, formatujDate } from "../dane";

/**
 * Wejście `Date` z wyboru daty (pole `YYYY-MM-DD` → `Date.UTC`) oraz `Date` o
 * północy czasu polskiego pokazują ten sam dzień — w czasie letnim (UTC+2)
 * i zimowym (UTC+1) — bez przesunięcia o dzień.
 */
const TERAZ = new Date("2026-09-30T10:00:00Z");

describe("przedłużenie dostępu — data z wyboru daty nie przesuwa dnia", () => {
  it.each([
    ["lato", "2027-07-15", "15 lipca 2027"],
    ["zima", "2027-01-15", "15 stycznia 2027"],
    ["pierwszy dzień miesiąca", "2027-03-01", "1 marca 2027"],
    ["przełom roku", "2026-12-31", "31 grudnia 2026"],
  ])("wybór daty (%s): %s → %s", (_nazwa, wpis, oczekiwane) => {
    const nowa = dataPoPrzedluzeniu(null, "until", "", wpis, TERAZ);
    expect(nowa).not.toBeNull();
    expect(formatujDate(nowa)).toBe(oczekiwane);
  });

  it.each([
    ["lato, północ w Warszawie (UTC+2)", "2027-07-14T22:00:00.000Z", "15 lipca 2027"],
    ["zima, północ w Warszawie (UTC+1)", "2027-01-14T23:00:00.000Z", "15 stycznia 2027"],
    ["lato, minuta przed północą", "2027-07-15T21:59:00.000Z", "15 lipca 2027"],
    ["zima, minuta przed północą", "2027-01-15T22:59:00.000Z", "15 stycznia 2027"],
  ])("Date o północy czasu polskiego: %s", (_nazwa, iso, oczekiwane) => {
    expect(formatujDate(new Date(iso))).toBe(oczekiwane);
  });

  it("nieprawidłowy Date i brak to „—”", () => {
    expect(formatujDate(new Date("nie-data"))).toBe("—");
    expect(formatujDate(null)).toBe("—");
  });
});
