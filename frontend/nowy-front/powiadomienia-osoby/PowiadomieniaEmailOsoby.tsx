"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Checkbox } from "@/design-system/atomy/Checkbox/Checkbox";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ApiError } from "@/lib/api/klient";
import {
  etykietaEmaila,
  pobierzPreferencje,
  zapiszPreferencje,
  zmienionePreferencje,
  type PreferencjaEmail,
} from "./dane";
import style from "./PowiadomieniaEmailOsoby.module.css";

type Stan = "ladowanie" | "blad" | "ok";

type Komunikat = { wariant: "ok" | "error"; tresc: string } | null;

/** Pierwszy komunikat pola z odpowiedzi 422 albo ogólny komunikat serwera. */
function trescBledu(wyjatek: unknown): string {
  if (wyjatek instanceof ApiError) {
    const pierwszy = Object.values(wyjatek.errors ?? {})[0]?.[0];
    return pierwszy ?? wyjatek.message;
  }
  return "Nie udało się zmienić ustawienia e-maila. Spróbuj ponownie.";
}

/**
 * Samodzielna karta „Powiadomienia e-mail”: osoba wyłącza dla siebie e-maile
 * oznaczone „Osoba może wyłączyć w Profilu” (`GET`/`PUT
 * /notifications/preferences`). Powiadomienie w panelu zostaje zawsze.
 * E-maili, których osoba nie może wyłączyć, karta nie pokazuje — mówi o nich
 * jedno zdanie.
 *
 * Każde przełączenie zapisuje się od razu (jeden wpis w `PUT`), więc karta
 * nie ma niezapisanych zmian. Odmowa serwera przywraca poprzedni stan
 * przełącznika i pokazuje powód.
 *
 * Karta nie zależy od ekranu, na którym stoi: sama wczytuje i zapisuje dane.
 */
export function PowiadomieniaEmailOsoby() {
  const [stan, setStan] = useState<Stan>("ladowanie");
  const [proba, setProba] = useState(0);
  const [robocze, setRobocze] = useState<PreferencjaEmail[]>([]);
  const [wToku, setWToku] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<Komunikat>(null);

  useEffect(() => {
    let anulowane = false;
    pobierzPreferencje()
      .then((dane) => {
        if (anulowane) return;
        setRobocze(dane);
        setStan("ok");
      })
      .catch(() => {
        if (!anulowane) setStan("blad");
      });
    return () => {
      anulowane = true;
    };
  }, [proba]);

  function ponow() {
    setStan("ladowanie");
    setProba((numer) => numer + 1);
  }

  async function przelacz(rodzaj: string, wartosc: boolean) {
    if (wToku !== null) return;
    const poprzednie = robocze;
    const nastepne = robocze.map((wpis) => (wpis.type === rodzaj ? { ...wpis, email: wartosc } : wpis));
    const zmiany = zmienionePreferencje(poprzednie, nastepne);
    if (zmiany.length === 0) return;

    setRobocze(nastepne);
    setWToku(rodzaj);
    setKomunikat(null);
    try {
      setRobocze(await zapiszPreferencje(zmiany));
      setKomunikat({
        wariant: "ok",
        tresc: `${etykietaEmaila(rodzaj)}: ${wartosc ? "e-mail włączony" : "e-mail wyłączony"}.`,
      });
    } catch (wyjatek) {
      setRobocze(poprzednie);
      setKomunikat({ wariant: "error", tresc: trescBledu(wyjatek) });
    } finally {
      setWToku(null);
    }
  }

  const wylaczalne = robocze.filter((wpis) => wpis.switchable);

  return (
    <section className={style.karta} aria-labelledby="powiadomienia-email-osoby">
      <Heading stopien={2} id="powiadomienia-email-osoby">
        Powiadomienia e-mail
      </Heading>
      <Text>
        Wybierz, o czym chcesz dostawać e-maile. Powiadomienie w panelu pojawi się zawsze.
      </Text>

      {stan === "ladowanie" && <Skeleton wiersze={4} />}

      {stan === "blad" && (
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać ustawień e-maili."
          akcja={
            <Button poziom="outline" onClick={ponow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Sprawdź połączenie i spróbuj ponownie.
        </Notice>
      )}

      {stan === "ok" && (
        <>
          <fieldset className={style.lista} aria-label="E-maile, które możesz wyłączyć">
            {wylaczalne.map((wpis) => (
              <Checkbox
                key={wpis.type}
                id={`email-${wpis.type}`}
                zaznaczony={wpis.email}
                onZmiana={(wartosc) => void przelacz(wpis.type, wartosc)}
                etykieta={etykietaEmaila(wpis.type)}
              />
            ))}
          </fieldset>
          <Text>
            Niektórych e-maili nie można wyłączyć: wychodzą zawsze albo wyłącza je tylko administracja.
          </Text>

          {komunikat && (
            <div role="status">
              <Notice
                wariant={komunikat.wariant}
                tytul={komunikat.wariant === "error" ? "Nie zmieniono ustawienia" : "Zmiana zapisana"}
              >
                {komunikat.tresc}
              </Notice>
            </div>
          )}
        </>
      )}
    </section>
  );
}
