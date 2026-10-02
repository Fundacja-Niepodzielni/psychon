"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ApiError } from "@/lib/api/klient";
import { pobierzPlikEksportu, pobierzStanEksportu, zlecEksport, type EksportDanych } from "./dane";
import {
  CZAS_SPRAWDZANIA_MS,
  czyPrzygotowywany,
  komunikatBleduZlecenia,
  KOMUNIKAT_EKSPORT_WYGASL,
  KOMUNIKAT_POBRANIE_NIEUDANE,
  KOMUNIKAT_PRZYGOTOWANIE_NIEUDANE,
  KOMUNIKAT_SPRAWDZANIE_NIEUDANE,
} from "./eksport";
import style from "./ProfilUczestnika.module.css";

/**
 * Karta „Eksport danych (RODO)”: zlecenie eksportu, sprawdzanie jego stanu co 2 sekundy
 * (jedno żądanie naraz), pobranie pliku i wygaśnięcie po 24 godzinach — ten sam przebieg
 * co na starej stronie profilu. Stany: nie rozpoczęty · przygotowywanie · gotowy ·
 * wygasł · błąd. Jedyny główny przycisk karty zmienia się ze stanem („Przygotuj eksport”,
 * „Pobierz plik”, „Przygotuj nowy eksport”); każdy przycisk niedostępny ma obok widoczne
 * zdanie, dlaczego, a kliknięcie takiego przycisku niczego nie robi.
 *
 * Stan eksportu żyje tylko na tym ekranie (serwer nie ma trasy listy eksportów): po
 * wyjściu i powrocie karta zaczyna od „nie rozpoczęty”, tak samo jak stara strona.
 */
export function KartaEksportu() {
  const idNaglowka = useId();
  const idPowoduZlecenia = useId();
  const idPowoduNowego = useId();
  const [eksport, setEksport] = useState<EksportDanych | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zlecanie, setZlecanie] = useState(false);
  const [pobieranie, setPobieranie] = useState(false);
  /** Sprawdzanie stanu zatrzymane błędem — osoba może je ponowić przyciskiem. */
  const [wstrzymane, setWstrzymane] = useState(false);
  const [numerProby, setNumerProby] = useState(0);
  const miejsceBledu = useRef<HTMLDivElement>(null);

  // Sprawdzanie stanu: jedno zaplanowane żądanie naraz; każda odpowiedź zastępuje stan
  // i planuje następne, dopóki eksport się buduje.
  useEffect(() => {
    if (eksport === null || wstrzymane || !czyPrzygotowywany(eksport.status)) return;
    const id = eksport.id;
    const czasomierz = setTimeout(async () => {
      try {
        const nastepny = await pobierzStanEksportu(id);
        setEksport(nastepny);
        if (nastepny.status === "failed") setBlad(KOMUNIKAT_PRZYGOTOWANIE_NIEUDANE);
      } catch {
        setBlad(KOMUNIKAT_SPRAWDZANIE_NIEUDANE);
        setWstrzymane(true);
      }
    }, CZAS_SPRAWDZANIA_MS);
    return () => clearTimeout(czasomierz);
  }, [eksport, wstrzymane, numerProby]);

  // Po błędzie fokus trafia na komunikat (Notice z błędem przyjmuje fokus programowy).
  useEffect(() => {
    if (blad !== null) miejsceBledu.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [blad]);

  async function zlec() {
    setZlecanie(true);
    setBlad(null);
    setWstrzymane(false);
    try {
      setEksport(await zlecEksport());
    } catch (wyjatek) {
      setBlad(komunikatBleduZlecenia(wyjatek));
    } finally {
      setZlecanie(false);
    }
  }

  async function pobierz() {
    if (eksport === null) return;
    setPobieranie(true);
    setBlad(null);
    try {
      await pobierzPlikEksportu(eksport.id);
    } catch (wyjatek) {
      // 404 na pobraniu znaczy „paczki już nie ma”: po 24 godzinach plik jest kasowany,
      // a trasa odpowiada tak samo jak na cudzy identyfikator.
      if (wyjatek instanceof ApiError && wyjatek.status === 404) {
        setEksport({ ...eksport, status: "expired", download_url: null });
        setBlad(KOMUNIKAT_EKSPORT_WYGASL);
      } else {
        setBlad(KOMUNIKAT_POBRANIE_NIEUDANE);
      }
    } finally {
      setPobieranie(false);
    }
  }

  function ponowSprawdzanie() {
    setBlad(null);
    setWstrzymane(false);
    setNumerProby((numer) => numer + 1);
  }

  const status = eksport?.status ?? null;
  const przygotowywany = status !== null && czyPrzygotowywany(status);
  const gotowy = status === "ready";
  const wygasl = status === "expired";
  // „Nowy” dopiero wtedy, gdy poprzedni eksport się skończył (gotowy, wygasł albo się nie udał).
  const etykietaZlecenia = eksport === null || przygotowywany ? "Przygotuj eksport" : "Przygotuj nowy eksport";

  // Powód, dla którego przycisk zlecenia jest teraz niedostępny (albo `null`, gdy działa).
  const powodZlecenia = zlecanie
    ? "Wysyłamy prośbę o eksport — za chwilę pokażemy jego stan."
    : przygotowywany
      ? "Eksport jest w trakcie przygotowania."
      : gotowy
        ? "Masz już gotowy plik. Nowy eksport przygotujesz, gdy ten wygaśnie."
        : null;
  const zlecenieGlowne = !gotowy;

  return (
    <section className={style.karta} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Eksport danych (RODO)
      </Heading>
      <Text>
        Przygotujemy plik ze wszystkimi Twoimi danymi: profilem, zgodami, postępami w nauce, wpisami stażu i
        listą wygenerowanych dokumentów.
      </Text>

      {blad !== null && (
        <div ref={miejsceBledu}>
          <Notice wariant="error" tytul="Eksport danych">
            {blad}
          </Notice>
        </div>
      )}

      {przygotowywany && (
        <div className={style.stanEksportu} role="status">
          <Badge wariant="pending">przygotowywanie</Badge>
          <Text>Przygotowujemy Twój plik. Zostań na tej stronie — pokażemy tu przycisk pobierania, gdy będzie gotowy.</Text>
        </div>
      )}
      {gotowy && (
        <div className={style.stanEksportu}>
          <Badge wariant="ok">gotowy</Badge>
          <Text>Twój plik jest gotowy. Plik usuniemy po 24 godzinach.</Text>
        </div>
      )}
      {wygasl && (
        <div className={style.stanEksportu}>
          <Badge wariant="neutral">wygasł</Badge>
          <Text>Plik wygasł i został usunięty. Przygotuj nowy eksport.</Text>
        </div>
      )}

      <div className={style.akcje}>
        {gotowy && (
          <Button
            poziom="primary"
            aria-disabled={pobieranie || undefined}
            onClick={() => {
              if (!pobieranie) void pobierz();
            }}
          >
            {pobieranie ? "Pobieranie…" : "Pobierz plik"}
          </Button>
        )}

        <div className={style.akcjaZPowodem}>
          <Button
            poziom={zlecenieGlowne ? "primary" : "outline"}
            aria-disabled={powodZlecenia === null ? undefined : true}
            aria-describedby={powodZlecenia === null ? undefined : gotowy ? idPowoduNowego : idPowoduZlecenia}
            onClick={() => {
              if (powodZlecenia === null) void zlec();
            }}
          >
            {zlecanie ? "Wysyłanie prośby…" : etykietaZlecenia}
          </Button>
          {powodZlecenia !== null && <Hint id={gotowy ? idPowoduNowego : idPowoduZlecenia}>{powodZlecenia}</Hint>}
        </div>

        {przygotowywany && wstrzymane && (
          <Button poziom="outline" onClick={ponowSprawdzanie}>
            Sprawdź ponownie
          </Button>
        )}
      </div>
    </section>
  );
}
