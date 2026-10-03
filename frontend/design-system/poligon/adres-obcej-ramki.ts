/** Domena zastrzeżona dla prób przeglądarkowych: pod nią ramki podaje atrapa. */
const DOMENA_ATRAPY = "atrapa.test";

/**
 * Adres obcej ramki poligonu: przechodzi wyłącznie `https:` w domenie atrapy prób
 * (poddomena `atrapa.test`, host porównywany dokładnie), bez danych logowania.
 * Każda inna wartość — brak ramki.
 */
export function adresObcejRamki(surowy: string | null): string | null {
  if (typeof surowy !== "string" || surowy.trim() === "") return null;
  let adres: URL;
  try {
    adres = new URL(surowy);
  } catch {
    return null;
  }
  if (adres.protocol !== "https:") return null;
  if (adres.username !== "" || adres.password !== "") return null;
  if (!adres.hostname.endsWith(`.${DOMENA_ATRAPY}`)) return null;
  return adres.href;
}
