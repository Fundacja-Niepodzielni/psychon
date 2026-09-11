import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "app", "globals.css"),
  "utf8",
);

describe("tokeny P2 w app/globals.css", () => {
  it("F-90: pierścień fokusu ma 3px w --psy-violet-dark (#1500BB), nie zielony z alfą < 3:1", () => {
    expect(css).toMatch(
      /--psy-focus-ring:\s*0 0 0 3px var\(--psy-violet-dark\)/,
    );
  });

  it("F-89: Roboto ładowany z plików lokalnych /fonts/, nie z CDN Google", () => {
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin-ext\.woff2"\)/);
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin\.woff2"\)/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("F-91: reguła prefers-reduced-motion: reduce jest zdefiniowana", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });
});
