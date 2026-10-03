import "@/design-system/tokeny/tokeny.css";
import Logo from "@/components/ui/Logo";
import { Niepowiazane } from "@/nowy-front/logowanie/Niepowiazane";

/**
 * Ekran nowego frontu pod trasą produktu `/logowanie/niepowiazane` — konto Niepodzielni bez powiązanego konta platformy. Strona publiczna stoi
 * poza powłoką panelu, więc szablon strony publicznej niesie jedyny `main` pod `id="tresc"`
 * i własną stopkę; dawna stopka układu głównego chowa się pod tym adresem przy włączonej
 * grupie (`components/layout/PublicFooter.tsx`). Znak Fundacji dostarcza ten plik, tak jak
 * strona podglądu; tokeny nowego frontu ładuje ten plik, `app/globals.css` zostaje nietknięty.
 */
export default function NiepowiazaneNowyEkran() {
  return (
    <div data-theme="light">
      <Niepowiazane logo={<Logo title="Fundacja Niepodzielni" />} />
    </div>
  );
}
