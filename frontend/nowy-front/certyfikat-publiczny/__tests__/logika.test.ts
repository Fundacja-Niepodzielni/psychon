import { describe, expect, it } from "vitest";
import { celZAdresu, opisStatusu } from "../logika";

const TOKEN = "x".repeat(40);

describe("logika certyfikatu publicznego", () => {
  it("cel z adresu", () => {
    expect(celZAdresu(null, null)).toEqual({ rodzaj: "brak" });
    expect(celZAdresu(null, " NP/2026/017 ")).toEqual({ rodzaj: "sciezka", sciezka: "/verify/NP/2026/017" });
    expect(celZAdresu(TOKEN, "NP/2026/017")).toEqual({ rodzaj: "sciezka", sciezka: `/verify/qr/${TOKEN}` });
    expect(celZAdresu("zly", null)).toEqual({ rodzaj: "bledny" });
    expect(celZAdresu(null, "NP/2026/01")).toEqual({ rodzaj: "bledny" });
  });

  it("stan nazwany słowem", () => {
    expect(opisStatusu("valid")).toEqual({ wariant: "ok", tekst: "Ważny" });
    expect(opisStatusu("revoked")).toEqual({ wariant: "error", tekst: "Unieważniony" });
  });
});
