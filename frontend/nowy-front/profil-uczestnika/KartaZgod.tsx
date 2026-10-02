import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { ListRow } from "@/design-system/molekuly/ListRow/ListRow";
import { formatujDate } from "../wspolne/daty";
import type { Zgoda } from "./dane";
import style from "./ProfilUczestnika.module.css";

/** Nazwy zgód po polsku; nieznany typ pokazuje swój kod, jak na starej stronie. */
const NAZWY_ZGOD: Record<string, string> = {
  regulamin: "Regulamin platformy",
  polityka: "Polityka prywatności",
  publikacja_profilu: "Zgoda na publikację profilu",
  marketing: "Zgoda marketingowa",
};

/**
 * Karta „Zgody” — tylko odczyt zgód z `GET /me`. Wiersz: nazwa zgody, stan słowem
 * („udzielona” · „wycofana”) i podlinia „Wersja … · z dnia …”.
 */
export function KartaZgod({ zgody }: { zgody: Zgoda[] }) {
  return (
    <section className={style.karta} aria-label="Zgody">
      <Heading stopien={2}>Zgody</Heading>
      {zgody.length === 0 ? (
        <Text wariant="pusty">Brak zapisanych zgód.</Text>
      ) : (
        <div className={style.lista}>
          {zgody.map((zgoda) => (
            <ListRow
              key={zgoda.type}
              wariant="ze-stanem"
              tytul={NAZWY_ZGOD[zgoda.type] ?? zgoda.type}
              plakietka={
                zgoda.status === "granted"
                  ? { wariant: "ok", tekst: "udzielona" }
                  : { wariant: "neutral", tekst: "wycofana" }
              }
              podpowiedz={`Wersja ${zgoda.document_version ?? "—"} · z dnia ${formatujDate(zgoda.granted_at)}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
