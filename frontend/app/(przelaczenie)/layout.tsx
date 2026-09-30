import type { ReactNode } from "react";
import "@/design-system/tokeny/tokeny.css";

/**
 * Układ grupy tras `(przelaczenie)` — ekrany nowego frontu przełączone pod
 * trasę produktu. Grupa tras (nawias) nie zmienia adresu:
 * `panel/dalsza-wspolpraca/page.tsx` w tym katalogu odpowiada za
 * `/panel/dalsza-wspolpraca`, `admin/zgloszenia-wspolpracy/page.tsx` — za
 * `/admin/zgloszenia-wspolpracy`. Układ jest wspólnym korzeniem grupy:
 * ładuje WYŁĄCZNIE `design-system/tokeny/tokeny.css` (ten sam wzorzec co
 * `app/nowy-front/layout.tsx`) i nie dotyka `app/globals.css`.
 *
 * Powłokę panelu (menu boczne, nagłówek, `PanelShell` ze wspólnych
 * komponentów) niosą układy segmentów: `panel/layout.tsx` (menu uczestnika
 * wg roli z `/me`) i `admin/layout.tsx` (menu administracji za strażnikiem
 * ról). To `PanelShell` renderuje jedyny link „Przejdź do treści”
 * (`href="#tresc"`) i jedyny `main` pod `id="tresc"`; szablon ekranu pod
 * powłoką renderuje `div` (`design-system/szablony/KontekstPowloki.tsx`).
 * Ten układ nie dokłada ani drugiego linku skoku, ani żadnego `main`.
 */
export default function UkladPrzelaczenia({ children }: { children: ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
