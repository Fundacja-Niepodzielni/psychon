"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { KeyValueRow } from "@/design-system/molekuly/KeyValueRow/KeyValueRow";
import { fetchWhoAmI, type WhoAmI } from "@/lib/api";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import { wylogujZKont } from "../wspolne/strona-publiczna/wylogowanie";
import style from "../wspolne/strona-publiczna/publiczne.module.css";
import wlasne from "./Konto.module.css";
import { ADRES_POWROTU_KONTA, usterkaZBledu, type Usterka } from "./logika";

/**
 * Ekran „Twoje konto” w nowym wyglądzie — jak `app/konto/page.tsx`: tożsamość
 * i role wprost z odpowiedzi `GET /sso/whoami` (`fetchWhoAmI()`), trzy rodzaje
 * usterki i wylogowanie z Kont. „Wyloguj” jest na ekranie w każdym stanie.
 */
export function Konto({ logo }: { logo?: ReactNode }) {
  const router = useRouter();
  const [tozsamosc, setTozsamosc] = useState<WhoAmI | null>(null);
  const [usterka, setUsterka] = useState<Usterka | null>(null);
  const [ladowanie, setLadowanie] = useState(true);
  const [wylogowywanie, setWylogowywanie] = useState(false);
  const idRol = useId();

  const wczytaj = useCallback(
    () =>
      fetchWhoAmI()
        .then((dane) => {
          setTozsamosc(dane);
          setUsterka(null);
        })
        .catch((wyjatek: unknown) => {
          setTozsamosc(null);
          setUsterka(usterkaZBledu(wyjatek));
        })
        .finally(() => setLadowanie(false)),
    [],
  );

  useEffect(() => {
    void wczytaj();
  }, [wczytaj]);

  function ponow() {
    setLadowanie(true);
    void wczytaj();
  }

  async function wyloguj() {
    if (wylogowywanie) return;
    setWylogowywanie(true);
    await wylogujZKont({
      wyjdz: (url) => window.location.assign(url),
      wroc: () => {
        setWylogowywanie(false);
        router.push(ADRES_POWROTU_KONTA);
      },
    });
  }

  return (
    <RamaPubliczna logo={logo}>
      <Karta>
        <Heading stopien={1}>Twoje konto</Heading>

        {ladowanie && <Wczytywanie etykieta="Wczytywanie…" />}

        {!ladowanie && usterka?.rodzaj === "sesja" && (
          <Komunikat wariant="error">
            <p>{usterka.komunikat}</p>
          </Komunikat>
        )}

        {!ladowanie && usterka?.rodzaj === "odmowa" && (
          <Komunikat wariant="warn" tytul="Brak dostępu">
            <p>{usterka.komunikat}</p>
          </Komunikat>
        )}

        {!ladowanie && usterka?.rodzaj === "awaria" && (
          <Komunikat
            wariant="error"
            tytul="Nie udało się wczytać danych"
            akcja={
              <Button poziom="outline" type="button" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            <p>{usterka.komunikat}</p>
          </Komunikat>
        )}

        {!ladowanie && tozsamosc && (
          <div className={style.stos}>
            <KeyValueRow etykieta="Identyfikator (sub)" wartosc={tozsamosc.sub} />
            <div className={wlasne.role}>
              <p className={wlasne.etykieta} id={idRol}>
                Role z tokenu
              </p>
              {tozsamosc.roles.length === 0 ? (
                <Text>Brak ról — to również jest poprawny stan.</Text>
              ) : (
                <ul className={wlasne.lista} aria-labelledby={idRol}>
                  {tozsamosc.roles.map((rola) => (
                    <li key={rola}>
                      <Badge wariant="neutral">{rola}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className={style.przyciski}>
          <Button
            poziom="outline"
            type="button"
            aria-busy={wylogowywanie || undefined}
            aria-disabled={wylogowywanie || undefined}
            onClick={() => void wyloguj()}
          >
            Wyloguj
          </Button>
        </div>
      </Karta>
    </RamaPubliczna>
  );
}
