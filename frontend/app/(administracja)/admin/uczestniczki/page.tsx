import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GRUPY, celTrasyEkranu, czyStaraTrasaPrzekierowuje } from "@/lib/przelaczenie/grupy";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { OsobyLista } from "@/nowy-front/osoby-lista/OsobyLista";
import AdminUsersStaraTresc from "./StaraTresc";

/** Tytuł karty jak dotąd, także przy włączonej grupie. */
export const metadata: Metadata = {
  title: "Uczestniczki i uczestnicy — Niepodzielni",
};

/** Wartość parametru `zakladka` z adresu starej strony (zakładka „Zgłoszenia”). */
const ZAKLADKA_ZGLOSZEN = "zgloszenia";

interface WlasciwosciStrony {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Strona osób w administracji `/admin/uczestniczki` — trasa wspólna dwóch grup
 * przełączenia (`lib/przelaczenie/grupy.ts`):
 * - `nabor`: stara zakładka „Zgłoszenia” (`?zakladka=zgloszenia`, adres z pulpitu
 *   i ze spraw) przy grupie włączonej przekierowuje (307) na `/admin/nabor` —
 *   bez 404 i bez utraty zakładki. Reszta adresu `/admin/uczestniczki` nie
 *   przekierowuje: to trasa grupy `listaOsob`;
 * - `listaOsob`: adres się nie zmienia, zmienia się treść. Grupa wyłączona →
 *   dokładnie stara treść z zakładkami (`StaraTresc.tsx`, przeniesiona bez zmiany);
 *   grupa włączona → ekran „Uczestnicy programu” nowego frontu. Jedyny
 *   `main#tresc` daje powłoka układu administracji; `DostawcaPowloki` mówi
 *   szablonowi ekranu, że `main` niesie już powłoka. Zakładka „Osoby” i adres
 *   bez parametru pokazują nową listę osób.
 * Obie grupy włącza się razem: nowa lista osób nie niesie zakładki zgłoszeń,
 * dojście do nich to odnośnik na ekranie i trasa `/admin/nabor`.
 */
export default async function AdminUsersPage({ searchParams }: WlasciwosciStrony) {
  const { zakladka } = await searchParams;

  if (zakladka === ZAKLADKA_ZGLOSZEN && czyStaraTrasaPrzekierowuje(GRUPY.nabor, "administracja")) {
    redirect(celTrasyEkranu(GRUPY.nabor, "administracja")!);
  }

  if (!GRUPY.listaOsob.wlaczona) return <AdminUsersStaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <OsobyLista />
      </DostawcaPowloki>
    </div>
  );
}
