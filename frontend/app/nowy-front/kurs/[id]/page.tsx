import { KursAdministracji } from "@/nowy-front/kurs-administracji/KursAdministracji";
import { LekcjaEdycja } from "@/nowy-front/lekcja-edycja/LekcjaEdycja";
import styles from "./page.module.css";

/** Liczba całkowita z adresu albo `null` — ekran pokazuje wtedy stan „nie znaleziono”. */
function liczbaZAdresu(wartosc: string | string[] | undefined): number | null {
  return typeof wartosc === "string" && /^\d+$/.test(wartosc) ? Number(wartosc) : null;
}

/**
 * Trasa robocza pod prefiksem nowego frontu — kurs prowadzącego. Ten sam
 * ekran kursu co w administracji (`nowy-front/kurs-administracji/`) w roli
 * prowadzącego: trasy `/instructor/…`, bez publikacji, prowadzącego kursu,
 * zaproszeń i usunięcia. Z `?lekcja={idLekcji}` ta sama trasa pokazuje stronę
 * lekcji tego kursu (`nowy-front/lekcja-edycja/`) w roli prowadzącego —
 * odpowiednik adresu produktu `/prowadzacy/kursy/{id}/lekcje/{idLekcji}`.
 * Odczyt i zapis biegną z przeglądarki, z tokenem sesji. Wcięcie po bokach
 * (`page.module.css`) trzyma ekran bez ramki panelu w szerokości okna.
 */
export default async function StronaKursuNowyFront({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [klucz: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { lekcja } = await searchParams;

  if (lekcja !== undefined) {
    return (
      <div className={styles.obszar}>
        <LekcjaEdycja rola="instructor" idLekcji={liczbaZAdresu(lekcja)} idKursu={liczbaZAdresu(id)} />
      </div>
    );
  }

  return (
    <div className={styles.obszar}>
      <KursAdministracji idKursu={id} rola="instructor" />
    </div>
  );
}
