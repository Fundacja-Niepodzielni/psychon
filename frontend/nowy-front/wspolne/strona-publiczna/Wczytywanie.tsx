import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import style from "./publiczne.module.css";

/**
 * Stan wczytywania: widoczne zdanie i szkielet treści w jednym obszarze
 * `role="status"` z nazwą — ten sam opis dla czytnika co w starym `LoadingState`.
 */
export function Wczytywanie({ etykieta, wiersze = 3 }: { etykieta: string; wiersze?: number }) {
  return (
    <div role="status" aria-label={etykieta} className={style.stos}>
      <p className={style.zdanie}>{etykieta}</p>
      <Skeleton wiersze={wiersze} />
    </div>
  );
}
