import type { ReactNode } from "react";
import "@/design-system/tokeny/tokeny.css";
import style from "./layout.module.css";

/**
 * Układ grupy tras `(przelaczenie)` — ekrany nowego frontu przełączone pod
 * trasę produktu. Grupa tras (nawias) nie zmienia
 * adresu: `panel/dalsza-wspolpraca/page.tsx` w tym katalogu odpowiada za
 * `/panel/dalsza-wspolpraca`, `admin/zgloszenia-wspolpracy/page.tsx` — za
 * `/admin/zgloszenia-wspolpracy`. Layout ładuje WYŁĄCZNIE
 * `design-system/tokeny/tokeny.css` (ten sam wzorzec co
 * `app/nowy-front/layout.tsx`) i nie dotyka `app/globals.css` — oba
 * strumienie wyglądu żyją obok siebie w tej samej działającej aplikacji.
 *
 * Pierwszym elementem fokusu jest link skoku „Przejdź do treści”
 * (`href="#tresc"`); celem jest korzeń szablonu ekranu, niosący rolę „main”
 * pod `id="tresc"`. Układ sam punktu orientacyjnego nie niesie — dokładnie
 * jeden na ekran pochodzi zawsze z szablonu.
 *
 * Świadomie BEZ starego `PanelShell` (chrom starego frontu, klasy
 * `globals.css`) — mieszanie starego chromu ze starym strumieniem wyglądu
 * i nowej treści z nowym strumieniem w jednym ekranie byłoby dokładnie tym
 * mieszaniem strumieni, którego nie wolno robić niezauważenie. Rolę i
 * uprawnienia pilnuje `RequireRole` w każdej stronie osobno (ten sam
 * współdzielony strażnik co stary front).
 */
export default function UkladPrzelaczenia({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light">
      <a href="#tresc" className={style.skipLink}>
        Przejdź do treści
      </a>
      {children}
    </div>
  );
}
