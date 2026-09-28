// Rejestr NIEZALEŻNY od pomiar-celow-sladu.mjs — sam wzorzec co
// cele-oczekiwane.mjs (patrz komentarz tam dla pełnego uzasadnienia):
// gdyby lista celów żyła TYLKO w pomiar-celow-sladu.mjs, skrócenie jej
// obniżałoby też liczbę oczekiwaną i próba wracałaby zielona przy realnie
// mniejszym pokryciu. Ten plik nie mierzy niczego — mówi tylko, ile celów
// dotyku i o jakich nazwach POWINNO istnieć w fixture "slad-ciasny"
// (design-system/poligon/main.tsx, data-style-id="m7-breadcrumbs-slad-ciasny").
//
// Cztery, nie pięć: fixture ma 5 POZYCJI (Kursy/P1/M2/L5/Quiz), ale
// Breadcrumbs.tsx gwarantuje, że OSTATNIA pozycja nigdy nie jest
// odnośnikiem (zawsze <Text>, nawet z href) — Quiz nie jest odnośnikiem,
// więc nie jest CELEM DOTYKU (WCAG 2.5.8 definiuje "target" jako element
// aktywowalny; Text nie jest aktywowalny). pomiar-celow-sladu.mjs nadal
// wypisuje wymiar Quiz jako pozycję informacyjną, ale bez oceny
// pass/fail i poza tym rejestrem.
export const OCZEKIWANE_CELE_SLADU = ["slad-cel-0", "slad-cel-1", "slad-cel-2", "slad-cel-3"];
