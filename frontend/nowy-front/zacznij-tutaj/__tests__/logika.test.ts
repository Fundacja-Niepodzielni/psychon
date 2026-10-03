import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "@/components/onboarding/embed-url";
import { adresOsadzenia, czyAdministracja, pokazanieFilmu } from "../logika";

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

/**
 * Sposób pokazania filmu na ekranie: odtwarzacz osadzony tylko dla adresu
 * `https` z hostem youtube.com (albo jego poddomeną) lub youtu.be — z tym samym
 * przeliczeniem adresu co dziś; każdy inny adres `https` to wyłącznie odnośnik
 * otwierany w nowej karcie; adres bez `https` albo nieczytelny — nic.
 */
describe("sposób pokazania filmu", () => {
  it.each([
    ["https://youtu.be/abc", "https://www.youtube.com/embed/abc"],
    ["https://youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
    ["https://www.youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
    ["https://m.youtube.com/watch?v=abc", "https://www.youtube.com/embed/abc"],
    ["https://www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc"],
    ["HTTPS://WWW.YOUTUBE.COM/watch?v=abc", "https://www.youtube.com/embed/abc"],
    ["  https://youtu.be/abc  ", "https://www.youtube.com/embed/abc"],
  ])("YouTube %s → odtwarzacz %s", (wejscie, adres) => {
    expect(pokazanieFilmu(wejscie)).toEqual({ rodzaj: "odtwarzacz", adres });
  });

  it.each([
    ["https://evilyoutube.com/watch?v=x", "https://evilyoutube.com/watch?v=x"],
    ["https://notyoutube.com/watch?v=x", "https://notyoutube.com/watch?v=x"],
    ["https://youtube.com.example.com/watch?v=x", "https://youtube.com.example.com/watch?v=x"],
    ["https://example.com/youtube.com/watch?v=x", "https://example.com/youtube.com/watch?v=x"],
    ["https://www.youtube-nocookie.com/embed/abc", "https://www.youtube-nocookie.com/embed/abc"],
    ["https://player.vimeo.com/video/1", "https://player.vimeo.com/video/1"],
    ["https://www.yоutube.com/watch?v=x", "https://www.xn--yutube-wqf.com/watch?v=x"],
  ])("inny host https %s → tylko odnośnik %s", (wejscie, adres) => {
    expect(pokazanieFilmu(wejscie)).toEqual({ rodzaj: "odnosnik", adres });
  });

  it.each([
    "http://youtu.be/abc",
    "http://www.youtube.com/watch?v=abc",
    "http://example.com/film.mp4",
    "javascript:alert(1)",
    "data:text/html,<p>film</p>",
    "ftp://example.com/film.mp4",
    "//www.youtube.com/watch?v=abc",
    "nie adres",
    "",
  ])("bez https albo nieczytelny %j → nic", (wejscie) => {
    expect(pokazanieFilmu(wejscie)).toEqual({ rodzaj: "brak" });
  });
});

/**
 * Identyfikator filmu YouTube to od 1 do 64 znaków: litery łacińskie, cyfry,
 * `-` i `_`. Adres YouTube z takim identyfikatorem idzie do odtwarzacza. Adres
 * YouTube z innym identyfikatorem (pusty, kropka, dwie kropki, ukośnik, znak
 * zapytania, krzyżyk, spacja, dłuższy niż 64 znaki) jest jak każdy inny adres
 * `https` spoza reguły: tylko odnośnik otwierany w nowej karcie.
 */
describe("identyfikator filmu w adresie odtwarzacza", () => {
  const SZESCDZIESIAT_CZTERY = "a".repeat(64);
  const SZESCDZIESIAT_PIEC = "a".repeat(65);

  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=a-b_C9", "https://www.youtube.com/embed/a-b_C9"],
    ["https://youtu.be/a", "https://www.youtube.com/embed/a"],
    [`https://www.youtube.com/watch?v=${SZESCDZIESIAT_CZTERY}`, `https://www.youtube.com/embed/${SZESCDZIESIAT_CZTERY}`],
  ])("identyfikator z liter, cyfr, „-” i „_” %s → odtwarzacz %s", (wejscie, adres) => {
    expect(pokazanieFilmu(wejscie)).toEqual({ rodzaj: "odtwarzacz", adres });
  });

  it.each([
    ["https://www.youtube.com/watch?v=.", "https://www.youtube.com/watch?v=."],
    ["https://www.youtube.com/watch?v=..", "https://www.youtube.com/watch?v=.."],
    ["https://www.youtube.com/watch?v=a/b", "https://www.youtube.com/watch?v=a/b"],
    ["https://www.youtube.com/watch?v=a?b", "https://www.youtube.com/watch?v=a?b"],
    ["https://youtu.be/.", "https://youtu.be/"],
    ["https://youtu.be/..", "https://youtu.be/"],
    ["https://youtu.be/a/b", "https://youtu.be/a/b"],
    ["https://youtu.be/a%3Fb", "https://youtu.be/a%3Fb"],
    ["https://www.youtube.com/watch?v=../../channel/x", "https://www.youtube.com/watch?v=../../channel/x"],
    ["https://www.youtube.com/watch?v=abc%3Fautoplay%3D1", "https://www.youtube.com/watch?v=abc%3Fautoplay%3D1"],
    ["https://www.youtube.com/watch?v=abc%23t%3D5", "https://www.youtube.com/watch?v=abc%23t%3D5"],
    ["https://youtu.be/a%20b", "https://youtu.be/a%20b"],
    ["https://www.youtube.com/watch?v=", "https://www.youtube.com/watch?v="],
    ["https://youtu.be/", "https://youtu.be/"],
    [`https://www.youtube.com/watch?v=${SZESCDZIESIAT_PIEC}`, `https://www.youtube.com/watch?v=${SZESCDZIESIAT_PIEC}`],
  ])("identyfikator spoza liter, cyfr, „-” i „_” albo dłuższy niż 64 znaki %s → tylko odnośnik %s", (wejscie, adres) => {
    expect(pokazanieFilmu(wejscie)).toEqual({ rodzaj: "odnosnik", adres });
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
