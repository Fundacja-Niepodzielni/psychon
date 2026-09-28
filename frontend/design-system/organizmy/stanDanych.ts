/**
 * Stan wczytywania danych organizmu, wspólny dla drzewa kursu, wykresu i bloku
 * lekcji. `gotowy` pokazuje dane (albo stan pusty, gdy danych jest zero),
 * `ladowanie` pokazuje szkielet w kształcie treści, `blad` pokazuje komunikat
 * z jednym zdaniem i przyciskiem ponowienia. Stan pusty nie jest tu osobną
 * wartością: wynika z samych danych, więc nie może się z nimi rozjechać.
 */
export type StanDanych =
  | { rodzaj: "gotowy" }
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; tresc: string; onPonow: () => void };

export const STAN_GOTOWY: StanDanych = { rodzaj: "gotowy" };
