import type { ReactNode } from "react";
import "@/design-system/tokeny/tokeny.css";

/**
 * Układ grupy tras `(przelaczenie)` — ekrany nowego frontu przełączone pod
 * trasę produktu. Grupa tras (nawias) nie zmienia
 * adresu: `panel/dalsza-wspolpraca/page.tsx` w tym katalogu odpowiada za
 * `/panel/dalsza-wspolpraca`, `admin/zgloszenia-wspolpracy/page.tsx` — za
 * `/admin/zgloszenia-wspolpracy`. Layout ładuje WYŁĄCZNIE
 * `design-system/tokeny/tokeny.css` (ten sam wzorzec co
 * `app/nowy-front/layout.tsx`, jedyny dotychczasowy konsument tokenów pod
 * `app/`) i nie dotyka `app/globals.css` — oba strumienie wyglądu żyją
 * obok siebie w tej samej działającej aplikacji.
 *
 * Świadomie BEZ starego `PanelShell` (chrom starego frontu, klasy
 * `globals.css`) — mieszanie starego chromu ze starym strumieniem wyglądu
 * i nowej treści z nowym strumieniem w jednym ekranie byłoby dokładnie tym
 * mieszaniem strumieni, którego nie wolno robić niezauważenie. Rolę i
 * uprawnienia pilnuje `RequireRole` w każdej stronie osobno (ten sam
 * współdzielony strażnik co stary front).
 */
export default function UkladPrzelaczenia({ children }: { children: ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
