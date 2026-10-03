"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { checkAccountBinding, KONTO_BINDING_LIMIT_MS, type AccountBindingCheck } from "@/lib/api";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { wylogujZKont } from "../wspolne/strona-publiczna/wylogowanie";
import style from "../wspolne/strona-publiczna/publiczne.module.css";
import wlasne from "./Logowanie.module.css";
import {
  ADRES_LOGOWANIA,
  ADRES_ZABLOKOWANE,
  naglowekNiepowiazania,
  sprawdzZLimitem,
  stanZWyniku,
  type StanNiepowiazania,
} from "./logika";

/**
 * Ekran „konto nie jest jeszcze połączone” w nowym wyglądzie — ten sam
 * przebieg co `app/logowanie/niepowiazane/page.tsx`: sprawdzenie powiązania z
 * limitem `KONTO_BINDING_LIMIT_MS`, identyfikator do przekazania z przyciskiem
 * „Kopiuj”, awaria z ponowieniem wyłącznie na kliknięcie, przejście na ekran
 * blokady i wylogowanie z Kont. Zmienna część ekranu jest w jednym obszarze
 * `aria-live="polite"`.
 */
export function Niepowiazane({ logo }: { logo?: ReactNode }) {
  const router = useRouter();
  const [wylogowywanie, setWylogowywanie] = useState(false);
  const [sprawdzanie, setSprawdzanie] = useState(false);
  const [stan, setStan] = useState<StanNiepowiazania>({ rodzaj: "sprawdzanie" });
  const trwaPonowienie = useRef(false);

  const zastosujWynik = useCallback((wynik: AccountBindingCheck | null) => {
    setStan(stanZWyniku(wynik));
  }, []);

  useEffect(() => {
    if (stan.rodzaj === "zablokowane") router.replace(ADRES_ZABLOKOWANE);
  }, [stan.rodzaj, router]);

  useEffect(() => {
    let anulowane = false;
    void sprawdzZLimitem(checkAccountBinding, KONTO_BINDING_LIMIT_MS).then((wynik) => {
      if (!anulowane) zastosujWynik(wynik);
    });
    return () => {
      anulowane = true;
    };
  }, [zastosujWynik]);

  async function ponowSprawdzenie() {
    if (trwaPonowienie.current) return;
    trwaPonowienie.current = true;
    setSprawdzanie(true);
    const wynik = await sprawdzZLimitem(checkAccountBinding, KONTO_BINDING_LIMIT_MS);
    zastosujWynik(wynik);
    setSprawdzanie(false);
    trwaPonowienie.current = false;
  }

  async function kopiujIdentyfikator() {
    if (stan.rodzaj !== "identyfikator") return;
    await navigator.clipboard.writeText(stan.sub);
  }

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
        <Heading stopien={1}>{naglowekNiepowiazania(stan)}</Heading>
        <div aria-live="polite" className={style.stos}>
          {stan.rodzaj === "sprawdzanie" || stan.rodzaj === "zablokowane" ? (
            <Komunikat wariant="info">
              <p>Sprawdzam stan Twojego konta…</p>
            </Komunikat>
          ) : stan.rodzaj === "identyfikator" ? (
            <Komunikat wariant="error">
              <p>Twoje konto Niepodzielni nie jest jeszcze powiązane z PsychON. Przekaż administratorowi ten identyfikator:</p>
              <div className={wlasne.identyfikator}>
                <code className={wlasne.kod}>{stan.sub}</code>
                <Button poziom="outline" type="button" onClick={() => void kopiujIdentyfikator()}>
                  Kopiuj
                </Button>
              </div>
            </Komunikat>
          ) : stan.rodzaj === "awaria" ? (
            <Komunikat
              wariant="info"
              akcja={
                <Button
                  poziom="primary"
                  type="button"
                  aria-busy={sprawdzanie || undefined}
                  aria-disabled={sprawdzanie || undefined}
                  onClick={() => void ponowSprawdzenie()}
                >
                  Spróbuj ponownie
                </Button>
              }
            >
              <p>Nie udało się sprawdzić stanu Twojego konta — spróbuj ponownie za chwilę.</p>
            </Komunikat>
          ) : (
            <Komunikat wariant="error">
              <p>
                Twoje konto Niepodzielni zalogowało się poprawnie, ale nie jest jeszcze powiązane z żadnym kontem w
                PsychON. Użyj linku z zaproszenia, żeby powiązać konto, albo skontaktuj się z opiekunem projektu.
              </p>
            </Komunikat>
          )}
        </div>
        <div className={style.przyciski}>
          <Button
            poziom={stan.rodzaj === "awaria" ? "outline" : "primary"}
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
