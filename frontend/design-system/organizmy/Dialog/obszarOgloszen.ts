/**
 * Stały obszar ogłoszeń panelu — jeden na stronę, zawsze w dokumencie.
 *
 * Czytnik ekranu ogłasza zmianę treści obszaru `aria-live` tylko wtedy, gdy
 * obszar istniał PRZED zmianą. Komunikat wstawiony razem z nowym elementem
 * (np. `Toast` zamontowany po sukcesie) bywa przemilczany. Ten obszar
 * powstaje raz — najpóźniej przy otwarciu pierwszego okna `Dialog` — jako
 * ostatnie dziecko `body`, i nigdy nie jest usuwany; kolejne ogłoszenia
 * tylko podmieniają jego tekst.
 *
 * Obszar jest niewidoczny na ekranie (tekst wyłącznie dla czytnika) i nie ma
 * roli `status` — próby, które szukają widocznego komunikatu po roli,
 * dalej znajdują dokładnie ten jeden komunikat, który ekran sam pokazał.
 */

export const ATRYBUT_OBSZARU = "data-obszar-ogloszen-panelu";

/** Opóźnienie wpisania tekstu po wyczyszczeniu — czytnik zauważa zmianę także przy tym samym zdaniu. */
export const OPOZNIENIE_OGLOSZENIA_MS = 100;

const UKRYCIE_WIZUALNE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  border: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

let czasomierz: ReturnType<typeof setTimeout> | null = null;

/** Zwraca stały obszar ogłoszeń, zakładając go przy pierwszym wywołaniu. */
export function zapewnijObszarOgloszen(): HTMLElement | null {
  if (typeof document === "undefined" || !document.body) return null;
  const istniejacy = document.querySelector<HTMLElement>(`[${ATRYBUT_OBSZARU}]`);
  if (istniejacy) return istniejacy;
  const obszar = document.createElement("div");
  obszar.setAttribute(ATRYBUT_OBSZARU, "");
  obszar.setAttribute("aria-live", "polite");
  obszar.setAttribute("aria-atomic", "true");
  Object.assign(obszar.style, UKRYCIE_WIZUALNE);
  document.body.appendChild(obszar);
  return obszar;
}

/**
 * Ogłasza zdanie w stałym obszarze panelu (np. wynik zapisu z okna, które
 * właśnie się zamknęło). Kolejne ogłoszenie zastępuje poprzednie.
 */
export function oglosWPanelu(tresc: string): void {
  const obszar = zapewnijObszarOgloszen();
  if (!obszar) return;
  if (czasomierz !== null) clearTimeout(czasomierz);
  obszar.textContent = "";
  czasomierz = setTimeout(() => {
    czasomierz = null;
    obszar.textContent = tresc;
  }, OPOZNIENIE_OGLOSZENIA_MS);
}
