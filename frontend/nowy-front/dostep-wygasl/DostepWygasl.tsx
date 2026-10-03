import type { ReactNode } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";

export const ADRES_KONTAKTU = "kontakt@niepodzielni.com";

/**
 * Ekran wygasłego dostępu w nowym wyglądzie — te same zdania i ten sam jeden
 * odnośnik (kontakt mailowy) co `app/dostep-wygasl/page.tsx`. Bez żądań.
 */
export function DostepWygasl({ logo }: { logo?: ReactNode }) {
  return (
    <RamaPubliczna logo={logo}>
      <Karta>
        <Heading stopien={1}>Twój dostęp do platformy wygasł</Heading>
        <div>
          <Badge wariant="neutral">Konto nieaktywne</Badge>
        </div>
        <Text>
          Sześciomiesięczny okres dostępu do programu dobiegł końca. Jeśli chcesz dokończyć program albo uważasz, że
          to pomyłka — napisz do nas, a przedłużymy Twój dostęp.
        </Text>
        <Text>
          Kontakt: <Link href={`mailto:${ADRES_KONTAKTU}`}>{ADRES_KONTAKTU}</Link>
        </Text>
      </Karta>
    </RamaPubliczna>
  );
}
