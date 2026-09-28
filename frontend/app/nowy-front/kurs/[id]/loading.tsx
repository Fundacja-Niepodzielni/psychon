import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import style from "./loading.module.css";

/**
 * Stan „ładowanie” (`06-ATOMY §7`) trasy `/nowy-front/kurs/[id]` —
 * granica Next.js wywoływana, dopóki `page.tsx` (komponent serwerowy) czeka
 * na `pobierzDaneKursu`. `Skeleton` (A13): kształt treści, którą zastąpi.
 * Zero stylu w atrybucie — wygląd wyłącznie z `loading.module.css`.
 */
export default function LadowanieKursu() {
  return (
    <div className={style.uklad}>
      <Skeleton wariant="przycisk" />
      <Skeleton wiersze={3} />
    </div>
  );
}
