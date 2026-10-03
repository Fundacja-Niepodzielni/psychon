import "@/design-system/tokeny/tokeny.css";
import Logo from "@/components/ui/Logo";
import { Konto } from "@/nowy-front/konto/Konto";

/**
 * Ekran nowego frontu pod trasą produktu `/konto` — tożsamość z logowania i wylogowanie. Strona publiczna stoi
 * poza powłoką panelu, więc szablon strony publicznej niesie jedyny `main` pod `id="tresc"`
 * i własną stopkę; dawna stopka układu głównego chowa się pod tym adresem przy włączonej
 * grupie (`components/layout/PublicFooter.tsx`). Znak Fundacji dostarcza ten plik, tak jak
 * strona podglądu; tokeny nowego frontu ładuje ten plik, `app/globals.css` zostaje nietknięty.
 */
export default function KontoNowyEkran() {
  return (
    <div data-theme="light">
      <Konto logo={<Logo title="Fundacja Niepodzielni" />} />
    </div>
  );
}
