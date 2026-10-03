"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { adresPrzekierowaniaKont } from "./logika";

function Przekierowanie() {
  const router = useRouter();
  const blad = useSearchParams().get("error");

  useEffect(() => {
    router.replace(adresPrzekierowaniaKont(blad));
  }, [router, blad]);

  return null;
}

/**
 * Stary adres `/logowanie/konta` — wyłącznie przekierowanie na `/logowanie`
 * (z zachowanym `?error=`), jak `app/logowanie/konta/page.tsx`.
 */
export function PrzekierowanieKont({ logo }: { logo?: ReactNode }) {
  return (
    <RamaPubliczna logo={logo}>
      <Heading stopien={1}>Przekierowuję…</Heading>
      <Suspense fallback={null}>
        <Przekierowanie />
      </Suspense>
    </RamaPubliczna>
  );
}
