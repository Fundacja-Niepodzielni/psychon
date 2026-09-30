import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { formatujDate } from "../wspolne/daty";
import { czyPokazacCertyfikat } from "./dane";
import style from "./PoProgramieWspolpraca.module.css";

interface WlasciwosciKarty {
  /** `program_completed_at` z `GET /me`. */
  zakonczonoO: string | null;
  rola: string;
}

/**
 * Karta „Program ukończony”: data ukończenia i odnośniki do dokumentów,
 * kursów oraz — wyłącznie dla wolontariusza — certyfikatu. Certyfikat jest
 * odnośnikiem tylko dla wolontariusza, bo `GET /certificate/conditions`
 * odrzuca studenta, więc ekran nie obiecuje odnośnika, którego serwer
 * i tak nie spełni. Ta sama treść co dotychczasowa strona
 * `app/(uczestnik)/panel/po-programie/StaraTresc.tsx` (karta
 * `ProgramCompletedCard`).
 */
export function KartaProgramuUkonczonego({ zakonczonoO, rola }: WlasciwosciKarty) {
  return (
    <section className={style.karta} aria-label="Program ukończony">
      <Heading stopien={2}>Program ukończony</Heading>
      <Text>
        {`Program ukończono ${formatujDate(zakonczonoO)}. Materiały programu i dokumenty zostają dostępne bez ograniczenia czasowego.`}
      </Text>
      <ul className={style.odnosniki}>
        <li>
          <Link href="/panel/dokumenty">Twoje dokumenty</Link>
        </li>
        <li>
          <Link href="/panel/kursy">Kursy</Link>
        </li>
        {czyPokazacCertyfikat(rola) && (
          <li>
            <Link href="/panel/certyfikat">Certyfikat</Link>
          </li>
        )}
      </ul>
    </section>
  );
}
