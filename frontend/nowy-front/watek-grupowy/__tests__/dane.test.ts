import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Żądania ekranu są dokładnie tymi, które wykonuje stary komponent (`../../grupa-prowadzacego/POMIAR-STAREGO-EKRANU.md`):
 * te same trasy, metody i ciała; pierwsza strona wiadomości bez parametrów. Kontrole dodatnie: każda trasa
 * wołana raz, z oczekiwanymi argumentami.
 */

const api = vi.fn();
const apiPaged = vi.fn();
vi.mock("@/lib/api/klient", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

const dane = await import("../dane");
const { WATEK, WATEK_INDYWIDUALNY, WIADOMOSC_1, meta } = await import("./atrapy");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("żądania wątku grupowego", () => {
  it("lista: GET /threads, ekran zostawia tylko wątki grupowe", async () => {
    apiPaged.mockResolvedValue({ data: [WATEK_INDYWIDUALNY, WATEK], meta: meta() });
    expect(await dane.pobierzWatki()).toEqual([WATEK]);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith("/threads");
  });

  it("założenie: POST /threads bez ciała", async () => {
    api.mockResolvedValue(WATEK);
    await dane.zalozWatek();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/threads", { method: "POST" });
  });

  it("wiadomości: pierwsza strona bez parametrów, dalsze z parametrem page", async () => {
    apiPaged.mockResolvedValue({ data: [WIADOMOSC_1], meta: meta() });
    await dane.pobierzWiadomosci(5);
    await dane.pobierzWiadomosci(5, 1);
    await dane.pobierzWiadomosci(5, 3);
    expect(apiPaged).toHaveBeenNthCalledWith(1, "/threads/5");
    expect(apiPaged).toHaveBeenNthCalledWith(2, "/threads/5");
    expect(apiPaged).toHaveBeenNthCalledWith(3, "/threads/5?page=3");
  });

  it("wysłanie: POST z samym polem body", async () => {
    api.mockResolvedValue(WIADOMOSC_1);
    await dane.wyslijWiadomosc(5, "Cześć!");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/threads/5/messages", { method: "POST", body: { body: "Cześć!" } });
  });

  it("skład: POST i DELETE na tej samej ścieżce z numerem osoby, bez ciała", async () => {
    api.mockResolvedValue(null);
    await dane.dodajOsobe(5, 12);
    await dane.usunOsobe(5, 12);
    expect(api).toHaveBeenNthCalledWith(1, "/threads/5/members/12", { method: "POST" });
    expect(api).toHaveBeenNthCalledWith(2, "/threads/5/members/12", { method: "DELETE" });
  });

  it("limit znaków wiadomości z żądania serwera: 5000", () => {
    expect(dane.LIMIT_WIADOMOSCI).toBe(5000);
  });
});
