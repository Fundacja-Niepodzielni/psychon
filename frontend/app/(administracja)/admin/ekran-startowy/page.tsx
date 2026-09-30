import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { EkranStartowy } from "@/nowy-front/ekran-startowy/EkranStartowy";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/ekran-startowy` — redakcja treści ekranu „Zacznij tutaj” (H21).
 * Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `ekranStartowy`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa
 * włączona → ekran nowego frontu w powłoce panelu administracji. Powłoka
 * (układ `(administracja)/admin`) niesie jedyny `main#tresc`, a
 * `DostawcaPowloki` mówi szablonowi ekranu, żeby nie dokładał drugiego.
 * Strona starej wersji nie miała własnego tytułu karty, więc nowa też nie ma.
 */
export default function StronaEkranuStartowego() {
  if (!GRUPY.ekranStartowy.wlaczona) return <StaraTresc />;

  return (
    <DostawcaPowloki>
      <EkranStartowy />
    </DostawcaPowloki>
  );
}
