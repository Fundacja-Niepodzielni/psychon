/**
 * Punkty łamania warstwy 1 — 9 progów. Nazwane stałe, nie liczby rozrzucone
 * po komponentach. Odpowiadają progom z tokenów wyglądu; szerokość okna
 * porównuje się do tych wartości, nie do zapisanej wprost liczby.
 */
export const ZALAMANIA = {
  podpisPrzelacznikaZnika: 400,
  przyciskZawijaTekst: 480,
  telefon: 639,
  dziennikBezZawijania: 640,
  siatkaKafliDwieKolumny: 700,
  nastepnyKrokDwieKolumny: 900,
  menuSzuflada: 1023,
  paskoFilarowCztery: 1180,
  dwieKolumnyTresci: 1380,
} as const;

export type NazwaZalamania = keyof typeof ZALAMANIA;
