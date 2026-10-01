import type { NextConfig } from "next";

/**
 * Nagłówki bezpieczeństwa każdej strony (OWASP Cheat Sheet „HTTP Headers”).
 * Panel pokazuje dane osobowe, więc nie daje się go osadzić w obcej ramce,
 * a przeglądarka nie zgaduje typu treści. CSP ogranicza się dziś do
 * `frame-ancestors` — pełna polityka skryptów wymaga nonce'ów Nexta.
 * Przegląd ASVS: `docs/bezpieczenstwo/przeglad-asvs-dane.md`, wiersze V14.4.4–V14.4.7.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
