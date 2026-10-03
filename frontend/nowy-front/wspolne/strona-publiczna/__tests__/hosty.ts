import { vi } from "vitest";

/**
 * Strażnik hostów: podmienia `fetch` na atrapę, która zapisuje każdy adres, i
 * podaje adresy spoza własnego hosta strony. Testy ekranów publicznych
 * sprawdzają nim, że ekran nie woła żadnego innego hosta (dostawcy tożsamości,
 * nagrań, poczty). Odpowiedź atrapy ustawia test.
 */
export function straznikHostow(odpowiedz: (adres: string) => unknown = () => ({ json: async () => ({}) })) {
  const oryginal = globalThis.fetch;
  const adresy: string[] = [];
  const atrapa = vi.fn(async (wejscie: RequestInfo | URL) => {
    const adres = typeof wejscie === "string" ? wejscie : wejscie instanceof URL ? wejscie.href : wejscie.url;
    adresy.push(adres);
    return odpowiedz(adres);
  });
  globalThis.fetch = atrapa as unknown as typeof fetch;
  return {
    atrapa,
    adresy,
    obce: () => adresy.filter((adres) => new URL(adres, window.location.origin).origin !== window.location.origin),
    przywroc: () => {
      globalThis.fetch = oryginal;
    },
  };
}
