"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import type { BladObecnosci, KursUczestnika } from "../kurs-uczestnika/dane";
import { useObecnosc, useTeraz } from "../kurs-uczestnika/obecnosc";
import { zbudujWidokWebinaru } from "../kurs-uczestnika/webinar";
import style from "./KartaWebinaru.module.css";

/** Tytuły komunikatów o błędzie potwierdzenia; zdanie dla osoby pochodzi z serwera (poza brakiem połączenia). */
const TYTUL_BLEDU: Record<Exclude<BladObecnosci["rodzaj"], "siec">, string> = {
  okno: "Nie udało się potwierdzić udziału",
  "dostep-wygasl": "Dostęp wygasł",
  "brak-dostepu": "Brak dostępu",
  "nie-znaleziono": "Nie znaleziono webinaru",
  serwer: "Nie udało się potwierdzić udziału",
};

/**
 * Karta „Najbliższy webinar” na pulpicie uczestnika: tytuł (odnośnik do
 * webinaru), termin w Warszawie i działanie pasujące do stanu — odnośnik
 * „Dołącz do transmisji” (tylko https, nowa karta), przycisk „Potwierdzam
 * udział” w otwartym oknie, a po oknie „Obejrzyj nagranie” albo
 * „Nagranie pojawi się wkrótce.”. Potwierdzenie idzie tym samym żądaniem i tym
 * samym hakiem co na ekranie webinaru. Karta nie ma przycisku głównego — ten
 * stoi w nagłówku strony.
 */
export function KartaWebinaru({ webinar }: { webinar: KursUczestnika }) {
  const teraz = useTeraz();
  const { stan, nadpisanieOkna, potwierdz } = useObecnosc(webinar.slug);
  const widok = zbudujWidokWebinaru(webinar, teraz, stan.rodzaj === "potwierdzona" ? stan.attendedAt : null, nadpisanieOkna);
  const obszarKomunikatow = useRef<HTMLDivElement>(null);
  const obecnosc = widok.obecnosc;
  const wTrakcieZapisu = stan.rodzaj === "trwa";

  // Po potwierdzeniu przycisk znika, więc fokus przechodzi na zdanie o potwierdzeniu.
  const potwierdzono = stan.rodzaj === "potwierdzona";
  useEffect(() => {
    if (potwierdzono) obszarKomunikatow.current?.focus();
  }, [potwierdzono]);

  const blad = stan.rodzaj === "blad" ? stan.blad : null;
  return (
    <section className={style.karta} aria-label="Najbliższy webinar" data-karta-webinaru="">
      <Heading stopien={2}>Najbliższy webinar</Heading>
      <Heading stopien={3}>
        <Link href={`/panel/kursy/${webinar.slug}`}>{widok.tytul}</Link>
      </Heading>
      <Text>{widok.termin}</Text>
      <div className={style.akcje}>
        {widok.adresStreamu !== null && (
          <Link href={widok.adresStreamu} target="_blank" rel="noopener noreferrer">
            Dołącz do transmisji
          </Link>
        )}
        {(obecnosc.rodzaj === "czynny" || wTrakcieZapisu) && (
          <Button
            poziom="outline"
            aria-disabled={wTrakcieZapisu ? "true" : undefined}
            onClick={() => {
              if (!wTrakcieZapisu) potwierdz();
            }}
          >
            {wTrakcieZapisu ? "Zapisywanie…" : "Potwierdzam udział"}
          </Button>
        )}
        {widok.nagranie.rodzaj === "link" && <Link href={widok.nagranie.href}>Obejrzyj nagranie</Link>}
      </div>
      {obecnosc.rodzaj === "przed" && <Text>{obecnosc.powod}</Text>}
      {obecnosc.rodzaj === "minelo" && <Text>{obecnosc.zdanie}</Text>}
      {widok.nagranie.rodzaj === "wkrotce" && <Text>Nagranie pojawi się wkrótce.</Text>}
      <div className={style.komunikaty} role="status" tabIndex={-1} ref={obszarKomunikatow}>
        {obecnosc.rodzaj === "potwierdzona" && <Text>{obecnosc.zdanie}</Text>}
      </div>
      {blad !== null && (
        <Notice
          wariant="error"
          tytul={blad.rodzaj === "siec" ? "Brak połączenia" : TYTUL_BLEDU[blad.rodzaj]}
          akcja={
            blad.rodzaj === "siec" || blad.rodzaj === "serwer" ? (
              <Button poziom="outline" onClick={potwierdz}>
                Spróbuj ponownie
              </Button>
            ) : undefined
          }
        >
          {blad.rodzaj === "siec" ? "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie." : blad.komunikat}
        </Notice>
      )}
    </section>
  );
}
