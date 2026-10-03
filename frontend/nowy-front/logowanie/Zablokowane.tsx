"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { wylogujZKont } from "../wspolne/strona-publiczna/wylogowanie";
import style from "../wspolne/strona-publiczna/publiczne.module.css";
import { ADRES_LOGOWANIA } from "./logika";

/**
 * Ekran konta zablokowanego w nowym wyglądzie — jak
 * `app/logowanie/zablokowane/page.tsx`: wejście niczego nie czyta z serwera,
 * ekran nie podaje powodu blokady, sesję kończy dopiero „Wyloguj się”.
 */
export function Zablokowane({ logo }: { logo?: ReactNode }) {
  const router = useRouter();
  const [wylogowywanie, setWylogowywanie] = useState(false);

  async function wyloguj() {
    if (wylogowywanie) return;
    setWylogowywanie(true);
    await wylogujZKont({
      wyjdz: (url) => window.location.assign(url),
      wroc: () => {
        setWylogowywanie(false);
        router.push(ADRES_LOGOWANIA);
      },
    });
  }

  return (
    <RamaPubliczna logo={logo}>
      <Karta>
        <Heading stopien={1}>Konto jest zablokowane</Heading>
        <Komunikat wariant="error">
          <p>Nie możesz teraz korzystać z platformy. Jeśli to pomyłka, skontaktuj się z fundacją.</p>
        </Komunikat>
        <div className={style.przyciski}>
          <Button
            poziom="primary"
            type="button"
            aria-busy={wylogowywanie || undefined}
            aria-disabled={wylogowywanie || undefined}
            onClick={() => void wyloguj()}
          >
            Wyloguj się
          </Button>
        </div>
      </Karta>
    </RamaPubliczna>
  );
}
