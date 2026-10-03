import "@/design-system/tokeny/tokeny.css";
import Logo from "@/components/ui/Logo";
import { Zablokowane } from "@/nowy-front/logowanie/Zablokowane";

/**
 * Ekran nowego frontu pod trasą produktu `/logowanie/zablokowane` — konto zablokowane. Strona publiczna stoi
 * poza powłoką panelu, więc szablon strony publicznej niesie jedyny `main` pod `id="tresc"`
 * i własną stopkę; dawna stopka układu głównego chowa się pod tym adresem przy włączonej
 * grupie (`components/layout/PublicFooter.tsx`). Znak Fundacji dostarcza ten plik, tak jak
 * strona podglądu; tokeny nowego frontu ładuje ten plik, `app/globals.css` zostaje nietknięty.
 */
export default function ZablokowaneNowyEkran() {
  return (
    <div data-theme="light">
      <Zablokowane logo={<Logo title="Fundacja Niepodzielni" />} />
    </div>
  );
}
