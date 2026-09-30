"use client";

import { useRouter } from "next/navigation";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import style from "./loading.module.css";

/**
 * Stan „ładowanie” (`06-ATOMY §7`) trasy `/nowy-front/kurs/[id]` — granica
 * Next.js wywoływana, dopóki `page.tsx` (komponent serwerowy) czeka na
 * `pobierzDaneKursu`. Ten sam szablon `DetailTemplate` co ekran po wczytaniu:
 * jego korzeń jest jedynym `main` (`id="tresc"`, cel linku skoku z układu),
 * a `Skeleton` (A13) stoi w obszarze treści szablonu, w kształcie drzewa
 * tematów i danych kursu, które zastąpi. Komponent kliencki, bo przycisk
 * powrotu w nagłówku szablonu potrzebuje obsługi kliknięcia.
 */
export default function LadowanieKursu() {
  const router = useRouter();

  return (
    <DetailTemplate
      naglowek={{
        okruszki: [{ etykieta: "Kursy" }, { etykieta: "Tematy i lekcje" }],
        tytul: "Wczytywanie kursu",
        onPowrot: () => router.back(),
      }}
      glowna={
        <div className={style.uklad} aria-busy="true">
          <Skeleton wariant="przycisk" />
          <Skeleton wiersze={6} />
        </div>
      }
      wspierajaca={<Skeleton wiersze={3} />}
    />
  );
}
