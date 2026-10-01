import { describe, expect, test } from "vitest";
import nextConfig from "@/next.config";

/**
 * Próby z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V14.4.4–V14.4.7. Pilnowany warunek: `headers()` w `next.config.ts`
 * zwraca nagłówki bezpieczeństwa dla każdej ścieżki.
 */
async function headersForEveryPath(): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const catchAll = rules.find((rule) => rule.source === "/(.*)");

  return new Map((catchAll?.headers ?? []).map((header) => [header.key, header.value]));
}

describe("nagłówki bezpieczeństwa stron (next.config.ts headers())", () => {
  test("V14.4.4: X-Content-Type-Options ma wartość nosniff", async () => {
    expect((await headersForEveryPath()).get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("V14.4.5: Strict-Transport-Security ma max-age co najmniej jednego roku", async () => {
    const hsts = (await headersForEveryPath()).get("Strict-Transport-Security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);

    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
  });

  test("V14.4.6: Referrer-Policy nie wysyła pełnego adresu do obcych źródeł", async () => {
    expect((await headersForEveryPath()).get("Referrer-Policy")).toMatch(
      /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/,
    );
  });

  test("V14.4.7: CSP zawiera frame-ancestors 'none'", async () => {
    expect((await headersForEveryPath()).get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("V14.4.7: panel nie daje się osadzić w obcej ramce (X-Frame-Options: DENY)", async () => {
    expect((await headersForEveryPath()).get("X-Frame-Options")).toBe("DENY");
  });
});
