import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefakt `vite build --config vite.config.poligon.ts` (patrz
    // scripts/uruchom-pomiar-celow-dotyku.mjs). Jest w .gitignore, ale eslint 9
    // go nie czyta - bez wpisu tutaj lokalny bieg pomiaru celow dotyku zaczerwienia `lint`
    // skutkiem ubocznym (zbudowany, zminifikowany kod wchodzi pod regulki
    // react-hooks/no-unused-expressions itd.), nie realna zmiana w kodzie.
    "dist-poligon/**",
  ]),
]);

export default eslintConfig;
