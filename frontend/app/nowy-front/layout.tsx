import type { ReactNode } from "react";
import "@/design-system/tokeny/tokeny.css";

/**
 * Układ segmentu `/nowy-front` — jedyny konsument `tokeny.css` w `app/`.
 * Nie dotyka `app/globals.css`: ten wciąż ładuje
 * się z układu głównego (`app/layout.tsx`), oba zestawy tokenów żyją obok
 * siebie w tej samej działającej aplikacji — to jest właśnie mierzone.
 */
export default function UkladNowegoFrontu({ children }: { children: ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
