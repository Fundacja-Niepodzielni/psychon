import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { naruszenia, plikiZrodlowe, REGULY } from "./zrodla";

describe("źródła wspólnych klocków ekranów publicznych", () => {
  it("bez naruszeń", () => {
    const pliki = plikiZrodlowe(resolve(__dirname, ".."));
    expect(pliki.length).toBeGreaterThan(0);
    expect(naruszenia(pliki)).toEqual([]);
  });

  it.each([
    ["surowe elementy interaktywne", '<button type="button">'],
    ["twarde barwy", "color: #fff;"],
    ["import z components/", 'import Logo from "@/components/ui/Logo";'],
    ["wstrzykiwanie HTML", "dangerouslySetInnerHTML={{ __html: x }}"],
    ["własny formater dat", "data.toLocaleDateString()"],
    ["adres innego hosta", 'fetch("https://example.test/")'],
  ])("kontrola dodatnia: reguła „%s” łapie tekst, który ją łamie", (nazwa, tekst) => {
    expect(REGULY[nazwa].test(tekst)).toBe(true);
  });
});
