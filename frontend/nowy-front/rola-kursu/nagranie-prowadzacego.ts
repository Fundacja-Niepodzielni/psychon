/**
 * Sekcja nagrania lekcji w roli prowadzącego: karta „Nagranie” na stronie
 * lekcji i pytania o stan nagrań na ekranie kursu. Wyłączona, dopóki
 * zaplecze nie ma tras nagrań prowadzącego
 * (`POST /instructor/lessons/{lesson}/video-uploads`,
 * `GET /instructor/lessons/{lesson}/video-status`). Włączenie to zmiana tej
 * jednej linii.
 */
export const NAGRANIE_PROWADZACEGO = false;
