// Rejestr NIEZALEŻNY od tablicy `CELE` w pomiar-celow-dotyku.mjs — tylko nazwy celów
// dotyku, bez selektorów, w OSOBNYM pliku. Cel: gdy ktoś skróci `CELE`
// (pomyłką, refaktorem, pośpiechem), ten plik NIE rusza się razem z nią, więc
// rozjazd jest widoczny i nazwany, zamiast po cichu obniżyć próg pokrycia.
//
// Zmierzone przed tą zmianą: „OCZEKIWANE POMIAROW” liczyło się jako
// `CELE.length * ...` — usunięcie jednego wpisu z `CELE` obniżało też
// oczekiwaną liczbę, więc próba wracała zielona (36/36) przy realnym
// pokryciu 9 elementów zamiast 10. Ten rejestr nie mierzy niczego sam —
// mówi tylko, ile celów i o jakich nazwach POWINNO istnieć w `CELE`.
//
// Utrzymanie: gdy w design-system/poligon/main.tsx przybywa albo ubywa
// zmierzalny element, ZAKTUALIZUJ TEN PLIK ręcznie i osobno od `CELE` w
// pomiar-celow-dotyku.mjs — to jest jego jedyny sens istnienia w osobnym pliku.
export const OCZEKIWANE_CELE = [
  "Button primary",
  "Button outline",
  "Button quiet",
  "Button sm",
  "Icon jako przycisk",
  "Link (pole klikalne)",
  "Link wariant okruszek",
  "Checkbox (etykieta = pole dotyku)",
  "Input",
  "Textarea",
];
