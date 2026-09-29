import type { ReactNode } from "react";
import "@/design-system/tokeny/tokeny.css";
import style from "./layout.module.css";

/**
 * Układ segmentu `/nowy-front` — jedyny konsument `tokeny.css` w `app/`.
 * Nie dotyka `app/globals.css`: ten wciąż ładuje
 * się z układu głównego (`app/layout.tsx`), oba zestawy tokenów żyją obok
 * siebie w tej samej działającej aplikacji — to jest właśnie mierzone.
 *
 * Pierwszym elementem fokusu jest link skoku „Przejdź do treści”
 * (`href="#tresc"`) — celem jest korzeń jednego z sześciu szablonów warstwy 5,
 * niosący rolę „main” pod `id="tresc"` z `tabIndex={-1}` (albo własny punkt
 * orientacyjny pięciu ekranów spoza szablonów). Ten układ sam punktu
 * orientacyjnego nie niesie — dokładnie jeden na ekran pochodzi zawsze
 * z niżej.
 */
export default function UkladNowegoFrontu({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light">
      <a href="#tresc" className={style.skipLink}>
        Przejdź do treści
      </a>
      {children}
    </div>
  );
}
