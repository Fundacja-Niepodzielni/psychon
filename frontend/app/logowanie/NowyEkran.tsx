import "@/design-system/tokeny/tokeny.css";
import Logo from "@/components/ui/Logo";
import { Logowanie } from "@/nowy-front/logowanie/Logowanie";

/**
 * Ekran nowego frontu pod trasą produktu `/logowanie` — logowanie przez Konta Niepodzielni. Strona publiczna stoi
 * poza powłoką panelu, więc szablon strony publicznej niesie jedyny `main` pod `id="tresc"`
 * i własną stopkę; dawna stopka układu głównego chowa się pod tym adresem przy włączonej
 * grupie (`components/layout/PublicFooter.tsx`). Znak Fundacji dostarcza ten plik, tak jak
 * strona podglądu; tokeny nowego frontu ładuje ten plik, `app/globals.css` zostaje nietknięty.
 */
export default function LogowanieNowyEkran() {
  return (
    <div data-theme="light">
      <Logowanie logo={<Logo title="Fundacja Niepodzielni" />} />
    </div>
  );
}
