import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "@/components/onboarding/embed-url";
import { adresOsadzenia, czyAdministracja } from "../logika";

/**
 * Reguła osadzenia filmu: wyłącznie host youtube.com (i jego poddomeny) oraz
 * youtu.be idą do odtwarzacza YouTube. Ta sama tabela co test starej funkcji,
 * plus zgodność z nią wartość w wartość.
 */
const PRZYPADKI: Array<[string, string]> = [
  ["https://youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
  ["https://www.youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
  ["https://m.youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
  ["https://youtu.be/abc", "https://www.youtube.com/embed/abc"],
  ["https://evilyoutube.com/watch?v=x", "https://evilyoutube.com/watch?v=x"],
  ["https://notyoutube.com/watch?v=x", "https://notyoutube.com/watch?v=x"],
  ["https://youtube.com.example.com/watch?v=x", "https://youtube.com.example.com/watch?v=x"],
  ["https://example.com/youtube.com/watch?v=x", "https://example.com/youtube.com/watch?v=x"],
  ["https://www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc"],
  ["https://player.vimeo.com/video/1", "https://player.vimeo.com/video/1"],
  ["nie adres", "nie adres"],
];

describe("adres osadzenia filmu", () => {
  it.each(PRZYPADKI)("%s → %s", (wejscie, wyjscie) => {
    expect(adresOsadzenia(wejscie)).toBe(wyjscie);
  });

  it.each(PRZYPADKI)("zgodność ze starą regułą: %s", (wejscie) => {
    expect(adresOsadzenia(wejscie)).toBe(toEmbedUrl(wejscie));
  });
});

describe("rola administracji", () => {
  it("tylko super_admin i project_manager", () => {
    expect(czyAdministracja("super_admin")).toBe(true);
    expect(czyAdministracja("project_manager")).toBe(true);
    expect(czyAdministracja("instructor")).toBe(false);
    expect(czyAdministracja("volunteer")).toBe(false);
    expect(czyAdministracja(null)).toBe(false);
  });
});
