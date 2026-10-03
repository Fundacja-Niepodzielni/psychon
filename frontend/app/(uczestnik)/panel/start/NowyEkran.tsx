import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { ZacznijTutaj } from "@/nowy-front/zacznij-tutaj/ZacznijTutaj";

/**
 * Ekran „Zacznij tutaj” nowego frontu pod trasą produktu `/panel/start`. Układ panelu uczestnika
 * (nowa ramka przy włączonej grupie) niesie jedyny `main` pod `id="tresc"`, więc ekran jest
 * owinięty w `DostawcaPowloki` — korzeń ekranu renderuje wtedy `div`, nie drugi `main`. Tokeny
 * nowego frontu ładuje ten plik; `app/globals.css` zostaje nietknięty.
 */
export default function ZacznijTutajNowyEkran() {
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <ZacznijTutaj />
      </DostawcaPowloki>
    </div>
  );
}
