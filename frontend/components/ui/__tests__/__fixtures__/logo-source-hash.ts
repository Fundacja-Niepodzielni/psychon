/**
 * Migawka znaku marki ze strony Fundacji, z którego powstał `Logo.tsx`
 * (CHANGELOG-P2.md, sekcja „Atomy P2” → `Logo`):
 * `_architektura/FRONT-PSYCHON/logo-niepodzielni-ze-strony-2026-09-11.svg`
 * (poza tym repozytorium — plik roboczy strony, nie frontu PsychON).
 *
 * Hash = sha256 konkatenacji atrybutów `d` wszystkich 20 elementów `<path
 * fill="#1500BB">` tego pliku, w kolejności występowania w dokumencie,
 * połączonych znakiem `|`. Chroni przed uwagą werdyktu: liczenie samych
 * ścieżek (`paths.length`) przepuszcza znak okaleczony do `d="M0 0Z"` —
 * porównanie treści `d` łapie taką mutację.
 *
 * Wygenerowane raz poleceniem (Node, `crypto.createHash("sha256")`) na
 * treści pliku źródłowego; nie jest przeliczane w testach (plik źródłowy
 * leży poza tym repozytorium).
 */
export const LOGO_SOURCE_D_SHA256 =
  "29dc31e04b2c788567ab6594a9a7e8230a239ee8c033e02ded162f54624b3574";
