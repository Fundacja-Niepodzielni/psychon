"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Text } from "@/design-system/atomy/Text/Text";
import { Breadcrumbs } from "@/design-system/molekuly/Breadcrumbs/Breadcrumbs";
import { KorzenSzablonu } from "@/design-system/szablony/KontekstPowloki";
import { useDaneRamki } from "@/design-system/szablony/KontekstRamki";
import { okruszekRamki } from "@/design-system/szablony/OkruszekRamki";
import { adresPowrotuZPodgladu, PasTrybuPodgladu, zParametremPodgladu } from "@/nowy-front/wspolne/tryb-podgladu";
import { ADRES_LISTY_KURSOW, type BladObecnosci, type KursUczestnika } from "./dane";
import { useObecnosc, useTeraz } from "./obecnosc";
import { zbudujWidokWebinaru } from "./webinar";
import style from "./KursUczestnika.module.css";
import webinar from "./Webinar.module.css";

const ZNACZNIK_UKONCZONY = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const POWOD_PODGLADU = "W podglądzie nic się nie zapisuje.";

interface WlasciwosciWidokuWebinaru {
  kurs: KursUczestnika;
  /** Tryb podglądu (jak na ekranie kursu): pas „Tryb podglądu…”, obecność się nie zapisuje. */
  podglad?: boolean;
  rola?: string | null;
}

/**
 * Widok webinaru na ekranie kursu uczestnika (`type: "webinar"`): tytuł, opis i
 * termin w Warszawie, odnośnik „Dołącz do transmisji” (tylko adres https, nowa
 * karta), przycisk „Potwierdzam udział” zależny od okna obecności (przed:
 * nieczynny z powodem, otwarte: czynny, po północy: zdanie o upływie czasu) oraz
 * część o nagraniu („Obejrzyj nagranie” na istniejącym ekranie lekcji albo
 * „Nagranie pojawi się wkrótce.”). Webinar nie ma tematów, lekcji ani testu i
 * nigdy nie jest zamknięty. Ukończenie (obecność albo nagranie) ogłasza
 * potwierdzenie na górze. Przyciskiem głównym jest zawsze jedno działanie:
 * potwierdzenie udziału, a po oknie — nagranie.
 */
export function WidokWebinaru({ kurs, podglad = false, rola = null }: WlasciwosciWidokuWebinaru) {
  const powrot = podglad ? adresPowrotuZPodgladu(rola, kurs.id) : null;
  const trybPodgladu = powrot !== null;
  const teraz = useTeraz();
  const { stan, nadpisanieOkna, potwierdz } = useObecnosc(kurs.slug);
  const widok = zbudujWidokWebinaru(kurs, teraz, stan.rodzaj === "potwierdzona" ? stan.attendedAt : null, nadpisanieOkna);
  const daneRamki = useDaneRamki();
  const wRamce = daneRamki !== null;
  const idPowodu = useId();
  const obszarKomunikatow = useRef<HTMLDivElement>(null);

  // Po potwierdzeniu przycisk znika, więc fokus przechodzi na zdanie o potwierdzeniu.
  const potwierdzono = stan.rodzaj === "potwierdzona";
  useEffect(() => {
    if (potwierdzono) obszarKomunikatow.current?.focus();
  }, [potwierdzono]);

  const okruszki = [{ etykieta: "Kursy", href: ADRES_LISTY_KURSOW }, { etykieta: kurs.title }];
  const pozycjeOkruszkow = daneRamki ? okruszekRamki({ menu: daneRamki.menu, sciezka: daneRamki.sciezka, okruszki, tytul: kurs.title }) : okruszki;

  const obecnosc = widok.obecnosc;
  const wTrakcieZapisu = stan.rodzaj === "trwa";
  // Przycisk jest widoczny w trzech stanach okna; czynny tylko w otwartym i nie w podglądzie.
  const pokazPrzycisk = obecnosc.rodzaj === "czynny" || obecnosc.rodzaj === "przed";
  const nieczynny = wTrakcieZapisu || obecnosc.rodzaj === "przed" || (obecnosc.rodzaj === "czynny" && trybPodgladu);
  const powodNieczynnosci =
    obecnosc.rodzaj === "przed" ? obecnosc.powod : obecnosc.rodzaj === "czynny" && trybPodgladu ? POWOD_PODGLADU : null;
  const nagranieGlowne = !widok.ukonczony && obecnosc.rodzaj !== "czynny";
  const pokazKarteUdzialu = widok.adresStreamu !== null || obecnosc.rodzaj !== "brak" || stan.rodzaj === "blad";

  return (
    <KorzenSzablonu className={style.strona} styleId="kurs-uczestnika">
      <div className={style.wnetrze} data-w-ramce={wRamce ? "" : undefined} data-webinar="">
        {trybPodgladu && (
          <div className={style.podgladMiejsce}>
            <PasTrybuPodgladu powrot={powrot} />
          </div>
        )}

        {pozycjeOkruszkow.length > 0 && (
          <div className={style.okruszki}>
            <Breadcrumbs pozycje={pozycjeOkruszkow} oznaczBiezaca={wRamce} />
          </div>
        )}
        <a className={style.wroc} href={ADRES_LISTY_KURSOW} aria-label="Wróć do listy kursów">
          <span aria-hidden="true">‹</span>Kursy
        </a>

        <div className={style.glowa}>
          <div className={style.tytul}>
            <Heading stopien={1}>{widok.tytul}</Heading>
            <p className={webinar.termin}>{widok.termin}</p>
          </div>
        </div>

        {widok.ukonczony && (
          <div className={webinar.ukonczenie} data-webinar-ukonczony="">
            <span className={style.znacznik}>
              {ZNACZNIK_UKONCZONY}
              Webinar ukończony
            </span>
            {obecnosc.rodzaj !== "potwierdzona" && widok.zdanieUkonczenia !== null && <p className={webinar.ukonczenieZdanie}>{widok.zdanieUkonczenia}</p>}
          </div>
        )}

        <div className={style.stos}>
          {widok.opis !== null && (
            <section className={style.karta} aria-labelledby={`${idPowodu}-opis`}>
              <div className={style.kartaNaglowek}>
                <Heading stopien={2} id={`${idPowodu}-opis`}>
                  O webinarze
                </Heading>
              </div>
              <p className={webinar.opis}>{widok.opis}</p>
            </section>
          )}

          {pokazKarteUdzialu && (
            <section className={style.karta} aria-labelledby={`${idPowodu}-udzial`} data-karta-udzialu="">
              <div className={style.kartaNaglowek}>
                <Heading stopien={2} id={`${idPowodu}-udzial`}>
                  Udział w webinarze
                </Heading>
              </div>
              <div className={webinar.sekcja}>
                {widok.adresStreamu !== null && (
                  <a className={style.przycisk} href={widok.adresStreamu} target="_blank" rel="noopener noreferrer">
                    Dołącz do transmisji
                  </a>
                )}
                {pokazPrzycisk || wTrakcieZapisu ? (
                  <>
                    <button
                      type="button"
                      className={`${style.przycisk} ${nieczynny ? style.nieczynny : style.przyciskGlowny}`}
                      aria-disabled={nieczynny ? "true" : undefined}
                      aria-describedby={powodNieczynnosci !== null ? `${idPowodu}-powod` : undefined}
                      data-przycisk-glowny={nieczynny ? undefined : ""}
                      onClick={(zdarzenie) => {
                        if (nieczynny) {
                          zdarzenie.preventDefault();
                          return;
                        }
                        potwierdz();
                      }}
                    >
                      {wTrakcieZapisu ? "Zapisywanie…" : "Potwierdzam udział"}
                    </button>
                    {powodNieczynnosci !== null && (
                      <p className={webinar.powodObecnosci} id={`${idPowodu}-powod`}>
                        {powodNieczynnosci}
                      </p>
                    )}
                  </>
                ) : null}
                {obecnosc.rodzaj === "minelo" && <p className={webinar.zdanie}>{obecnosc.zdanie}</p>}
                <div role="status" tabIndex={-1} ref={obszarKomunikatow}>
                  {obecnosc.rodzaj === "potwierdzona" && <p className={webinar.zdanie}>{obecnosc.zdanie}</p>}
                </div>
                {stan.rodzaj === "blad" && <BladPotwierdzenia blad={stan.blad} onPonow={potwierdz} />}
              </div>
            </section>
          )}

          {widok.nagranie.rodzaj !== "brak" && (
            <section className={style.karta} aria-labelledby={`${idPowodu}-nagranie`} data-karta-nagrania="">
              <div className={style.kartaNaglowek}>
                <Heading stopien={2} id={`${idPowodu}-nagranie`}>
                  Nagranie
                </Heading>
              </div>
              {widok.nagranie.rodzaj === "link" ? (
                <a
                  className={`${style.przycisk} ${nagranieGlowne ? style.przyciskGlowny : ""}`.trim()}
                  href={zParametremPodgladu(widok.nagranie.href, trybPodgladu)}
                  data-przycisk-glowny={nagranieGlowne ? "" : undefined}
                >
                  Obejrzyj nagranie
                </a>
              ) : (
                <p className={webinar.zdanie}>Nagranie pojawi się wkrótce.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </KorzenSzablonu>
  );
}

/** Tytuły komunikatów o błędzie potwierdzenia; zdanie dla osoby zawsze pochodzi z serwera (poza brakiem połączenia). */
const TYTUL_BLEDU: Record<Exclude<BladObecnosci["rodzaj"], "siec">, string> = {
  okno: "Nie udało się potwierdzić udziału",
  "dostep-wygasl": "Dostęp wygasł",
  "brak-dostepu": "Brak dostępu",
  "nie-znaleziono": "Nie znaleziono webinaru",
  serwer: "Nie udało się potwierdzić udziału",
};

function BladPotwierdzenia({ blad, onPonow }: { blad: BladObecnosci; onPonow: () => void }) {
  const tytul = blad.rodzaj === "siec" ? "Brak połączenia" : TYTUL_BLEDU[blad.rodzaj];
  const zdanie =
    blad.rodzaj === "siec" ? "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie." : blad.komunikat;
  const mozeSprobowacPonownie = blad.rodzaj === "siec" || blad.rodzaj === "serwer";
  return (
    <div className={`${style.komunikat} ${style.komunikatBlad}`} role="alert">
      <Icon nazwa="help" />
      <div className={style.komunikatTresc}>
        <Heading stopien={3}>{tytul}</Heading>
        <Text>{zdanie}</Text>
        {mozeSprobowacPonownie && (
          <div className={style.komunikatAkcja}>
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
