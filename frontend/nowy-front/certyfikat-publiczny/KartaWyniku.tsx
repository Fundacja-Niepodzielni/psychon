import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { formatujDate } from "../wspolne/daty";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { opisStatusu, type WynikWeryfikacji } from "./logika";
import style from "./CertyfikatPubliczny.module.css";

/**
 * Wynik weryfikacji certyfikatu — te same informacje co stara
 * `VerificationCard`: numer, stan (Ważny / Unieważniony), edycja i data
 * wydania. Certyfikat unieważniony stoi na ciepłej karcie, a stan zawsze
 * nazywa napis plakietki, nie sama barwa.
 */
export function KartaWyniku({ wynik }: { wynik: WynikWeryfikacji }) {
  const status = opisStatusu(wynik.status);
  return (
    <Karta ciepla={wynik.status !== "valid"}>
      <div className={style.glowa}>
        <div className={style.numer}>
          <p className={style.etykieta}>Certyfikat</p>
          <Heading stopien={2}>{wynik.number}</Heading>
        </div>
        <Badge wariant={status.wariant}>{status.tekst}</Badge>
      </div>
      <dl className={style.dane}>
        <div>
          <dt>Edycja</dt>
          <dd>{wynik.edition}</dd>
        </div>
        <div>
          <dt>Data wydania</dt>
          <dd>{formatujDate(wynik.issued_at)}</dd>
        </div>
      </dl>
    </Karta>
  );
}
