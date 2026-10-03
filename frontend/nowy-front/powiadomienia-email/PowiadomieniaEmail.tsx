"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useWPowloce } from "@/design-system/szablony/KontekstPowloki";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Przelacznik } from "@/design-system/atomy/Przelacznik/Przelacznik";
import { Text } from "@/design-system/atomy/Text/Text";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Field } from "@/design-system/molekuly/Field/Field";
import { EmptyState, zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Tabs } from "@/design-system/molekuly/Tabs/Tabs";
import { ApiError } from "@/lib/api/klient";
import { fetchAdminEmailsPage } from "@/lib/api/h16-emails";
import {
  czasWiadomosci,
  ETYKIETY_STATUSU_WIADOMOSCI,
  PodgladWiadomosci,
  WARIANTY_STATUSU_WIADOMOSCI,
} from "./PodgladWiadomosci";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  type PatchUstawienPowiadomien,
  type UstawieniaPowiadomien,
} from "@/lib/api/h16-ustawienia";
import type { MetaSkrzynki, WiadomoscEmail } from "./dane";
import { KARTY_RODZAJOW, OPIS_PRZYPOMNIENIA_SUPERWIZJI, type RodzajPowiadomienia } from "./rodzaje";
import style from "./PowiadomieniaEmail.module.css";

/**
 * Korzeń ekranu. Poza powłoką panelu: `main` pod `id="tresc"`. W powłoce
 * (`DostawcaPowloki`) `main` niesie powłoka, więc tu jest zwykły `div`.
 */
function Korzen({ children }: { children: ReactNode }) {
  const wPowloce = useWPowloce();
  if (wPowloce) return <div className={style.uklad}>{children}</div>;
  return (
    <main id="tresc" className={style.uklad}>
      {children}
    </main>
  );
}

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";

/** Nazwa ogólna dla rodzaju, którego front jeszcze nie zna (kod z zaplecza nie trafia do ekranu). */
const NAZWA_NIEZNANEGO_RODZAJU = "Inne powiadomienie";

/** 24 opcje `00:00`…`23:00` — wartość zawsze pełna godzina, bez minut. */
const GODZINY_WYSYLKI = Array.from({ length: 24 }, (_, godzina) => {
  const etykieta = `${String(godzina).padStart(2, "0")}:00`;
  return { wartosc: etykieta, etykieta };
});

type StanUstawien = "ladowanie" | "blad" | "ok";

/** Różnica robocza vs. ostatni odczyt → kształt PATCH z kontraktu (WYŁĄCZNIE
 * zmienione pola). */
function obliczRoznice(
  bazowy: UstawieniaPowiadomien,
  roboczy: UstawieniaPowiadomien,
): PatchUstawienPowiadomien {
  const bazoweTypy = new Map(bazowy.types.map((wpis) => [wpis.type, wpis.enabled]));
  const zmienioneTypy = roboczy.types.filter((wpis) => bazoweTypy.get(wpis.type) !== wpis.enabled);

  const zmienionePrzypomnienie: Partial<UstawieniaPowiadomien["supervision_reminder"]> = {};
  if (bazowy.supervision_reminder.enabled !== roboczy.supervision_reminder.enabled) {
    zmienionePrzypomnienie.enabled = roboczy.supervision_reminder.enabled;
  }
  if (bazowy.supervision_reminder.send_at !== roboczy.supervision_reminder.send_at) {
    zmienionePrzypomnienie.send_at = roboczy.supervision_reminder.send_at;
  }

  const patch: PatchUstawienPowiadomien = {};
  if (zmienioneTypy.length > 0) patch.types = zmienioneTypy;
  if (Object.keys(zmienionePrzypomnienie).length > 0) patch.supervision_reminder = zmienionePrzypomnienie;
  return patch;
}

function liczbaZmian(patch: PatchUstawienPowiadomien): number {
  return (patch.types?.length ?? 0) + Object.keys(patch.supervision_reminder ?? {}).length;
}

/**
 * Trasa `/nowy-front/admin/powiadomienia` — zarządzanie powiadomieniami
 * (H16), zbudowane WYŁĄCZNIE wg tras obecnych w `h16.php`. Administracja ma
 * tam dziś jedną trasę tego zasobu — `GET /admin/emails` (odczyt,
 * `EmailController::index`, `backend/routes/api/h16.php:34`); pakiet nie
 * ma trasy zmiany/usunięcia wiadomości ani ponownej wysyłki, więc ten ekran
 * jest przeglądem skrzynki (tabela + stronicowanie), nie formularzem
 * edycji — dopisanie przycisku akcji bez trasy byłoby zmyśleniem API wobec
 * kontraktu HTTP.
 *
 * Odczyt startowy biegnie z przeglądarki (`fetchAdminEmailsPage(1)`) —
 * powód identyczny jak w pozostałych dwóch ekranach administracji: `@/auth`
 * po stronie serwera nie wstaje pod Vitest/jsdom na trasach statycznych.
 *
 * Bez szukajki: `GET /admin/emails` nie ma parametru wyszukiwania — pole
 * filtrujące wyłącznie już pobraną (bieżącą) stronę udawałoby przeszukanie
 * całej skrzynki, którego backend nie robi. Lista „Wysłane” (`RecordList`)
 * nie ma szukajki w ogóle.
 *
 * Dwie zakładki: „Ustawienia” (domyślna) i „Wysłane” (skrzynka bez zmian).
 * Ustawienia (`GET`/`PATCH /admin/notification-settings`,
 * `backend/routes/api/h16.php:38-39`) to karty według obszaru: przełącznik
 * (`Przelacznik`) przy każdym rodzaju z nazwą i zdaniem „kto dostaje”
 * (`rodzaje.ts`) oraz blok przypomnienia o superwizji w karcie „Superwizje”
 * (przełącznik + `Field` z `Select` na godzinę w UTC: serwer porównuje godzinę ze strefą
 * `config('app.timezone')`, czyli UTC, nie czasem polskim). Stan ustawień jest
 * niezależny od skrzynki: własne `ladowanie`/`blad`/`ok`. Zapis: jeden
 * przycisk „Zapisz zmiany” i komunikat po zapisie; wyjście z ekranu z
 * niezapisanymi zmianami pyta rama panelu (`useZgloszenieNiezapisanychZmian`).
 * `PATCH` wysyła wyłącznie zmienione pola (`obliczRoznice` wyżej) — pełny
 * stan z odpowiedzi zastępuje stan roboczy i ostatni odczyt naraz.
 */
export function PowiadomieniaEmail() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [wiadomosci, setWiadomosci] = useState<WiadomoscEmail[]>([]);
  const [meta, setMeta] = useState<MetaSkrzynki | undefined>(undefined);
  const [blad, setBlad] = useState<string | null>(null);
  const [wczytywanie, setWczytywanie] = useState(false);
  /** Numer próby wczytania skrzynki — „Spróbuj ponownie” podbija go i odczyt rusza od nowa. */
  const [proba, setProba] = useState(0);
  const [zapisano, setZapisano] = useState(false);
  const [zakladka, setZakladka] = useState<"ustawienia" | "wyslane">("ustawienia");
  const [podglad, setPodglad] = useState<WiadomoscEmail | null>(null);
  const zamknijPodglad = useCallback(() => setPodglad(null), []);

  const [ustStan, setUstStan] = useState<StanUstawien>("ladowanie");
  const [ustOstatniOdczyt, setUstOstatniOdczyt] = useState<UstawieniaPowiadomien | null>(null);
  const [ustRoboczy, setUstRoboczy] = useState<UstawieniaPowiadomien | null>(null);
  const [ustTylkoOdczyt, setUstTylkoOdczyt] = useState(false);
  const [ustNoticeUprawnien, setUstNoticeUprawnien] = useState(false);
  const [ustBladSieci, setUstBladSieci] = useState<string | null>(null);
  const [ustBledyTypow, setUstBledyTypow] = useState<Record<string, string>>({});
  const [ustBledyPrzypomnienia, setUstBledyPrzypomnienia] = useState<{ enabled?: string; send_at?: string }>({});
  const [ustZapisywanie, setUstZapisywanie] = useState(false);
  useZgloszenieNiezapisanychZmian(
    ustStan === "ok" &&
      ustOstatniOdczyt !== null &&
      ustRoboczy !== null &&
      !ustTylkoOdczyt &&
      liczbaZmian(obliczRoznice(ustOstatniOdczyt, ustRoboczy)) > 0,
    "Ustawienia powiadomień",
  );

  useEffect(() => {
    let anulowane = false;
    fetchNotificationSettings()
      .then((dane) => {
        if (anulowane) return;
        setUstOstatniOdczyt(dane);
        setUstRoboczy(dane);
        setUstStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        if (wyjatek instanceof ApiError && wyjatek.status === 403) {
          setUstNoticeUprawnien(true);
          setUstTylkoOdczyt(true);
          setUstStan("ok");
          return;
        }
        setUstStan("blad");
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Tryb tylko do odczytu po 403: przełączniki i lista godzin są zablokowane
  // (`zablokowany`), a obsługa zdarzeń dodatkowo ignoruje zmianę.
  function przelaczTyp(kod: string, wartosc: boolean) {
    if (ustTylkoOdczyt) return;
    setZapisano(false);
    setUstRoboczy((roboczy) =>
      roboczy && {
        ...roboczy,
        types: roboczy.types.map((wpis) => (wpis.type === kod ? { ...wpis, enabled: wartosc } : wpis)),
      },
    );
  }

  function przelaczPrzypomnienie(wartosc: boolean) {
    if (ustTylkoOdczyt) return;
    setZapisano(false);
    setUstRoboczy(
      (roboczy) => roboczy && { ...roboczy, supervision_reminder: { ...roboczy.supervision_reminder, enabled: wartosc } },
    );
  }

  function zmienGodzinePrzypomnienia(wartosc: string) {
    if (ustTylkoOdczyt) return;
    setZapisano(false);
    setUstRoboczy(
      (roboczy) => roboczy && { ...roboczy, supervision_reminder: { ...roboczy.supervision_reminder, send_at: wartosc } },
    );
  }

  async function zapiszUstawienia() {
    if (!ustOstatniOdczyt || !ustRoboczy) return;
    const patch = obliczRoznice(ustOstatniOdczyt, ustRoboczy);
    if (liczbaZmian(patch) === 0) return;

    setUstZapisywanie(true);
    setZapisano(false);
    setUstBladSieci(null);
    setUstBledyTypow({});
    setUstBledyPrzypomnienia({});
    try {
      const odpowiedz = await updateNotificationSettings(patch);
      setUstOstatniOdczyt(odpowiedz);
      setUstRoboczy(odpowiedz);
      setZapisano(true);
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.status === 403) {
        setUstNoticeUprawnien(true);
        setUstTylkoOdczyt(true);
      } else if (wyjatek instanceof ApiError && wyjatek.status === 422 && wyjatek.errors) {
        const wyslaneTypy = patch.types ?? [];
        const bledyTypow: Record<string, string> = {};
        const bledyPrzypomnienia: { enabled?: string; send_at?: string } = {};
        for (const [klucz, wiadomosci] of Object.entries(wyjatek.errors)) {
          const tresc = wiadomosci[0];
          if (tresc === undefined) continue;
          const dopasowanieTypu = /^types\.(\d+)\.(type|enabled)$/.exec(klucz);
          if (dopasowanieTypu) {
            const kod = wyslaneTypy[Number(dopasowanieTypu[1])]?.type;
            if (kod) bledyTypow[kod] = tresc;
            continue;
          }
          if (klucz === "supervision_reminder.enabled") bledyPrzypomnienia.enabled = tresc;
          if (klucz === "supervision_reminder.send_at") bledyPrzypomnienia.send_at = tresc;
        }
        setUstBledyTypow(bledyTypow);
        setUstBledyPrzypomnienia(bledyPrzypomnienia);
      } else {
        setUstBladSieci("Nie udało się zapisać ustawień powiadomień. Spróbuj ponownie.");
      }
    } finally {
      setUstZapisywanie(false);
    }
  }

  useEffect(() => {
    let anulowane = false;
    fetchAdminEmailsPage(1)
      .then((odpowiedz) => {
        if (anulowane) return;
        setWiadomosci(odpowiedz.data);
        setMeta(odpowiedz.meta);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        setStan(wyjatek instanceof ApiError && wyjatek.status === 403 ? "brak-uprawnien" : "blad");
      });
    return () => {
      anulowane = true;
    };
  }, [proba]);

  function ponowWczytanie() {
    setStan("ladowanie");
    setProba((numer) => numer + 1);
  }

  const wierszeListy: WierszRecordList[] = useMemo(
    () =>
      wiadomosci.map((wiadomosc) => ({
        id: String(wiadomosc.id),
        tytul: wiadomosc.to_email,
        plakietka: {
          wariant: WARIANTY_STATUSU_WIADOMOSCI[wiadomosc.status],
          tekst: ETYKIETY_STATUSU_WIADOMOSCI[wiadomosc.status],
        },
        komorki: {
          temat: { tekst: wiadomosc.subject },
          wyslano: { tekst: czasWiadomosci(wiadomosc) },
        },
        akcja: {
          etykieta: "Podgląd",
          etykietaDostepna: `Podgląd: ${wiadomosc.subject}`,
          onKliknij: () => setPodglad(wiadomosc),
        },
      })),
    [wiadomosci],
  );

  async function przejdzNaStrone(strona: number) {
    setWczytywanie(true);
    setBlad(null);
    try {
      const odpowiedz = await fetchAdminEmailsPage(strona);
      setWiadomosci(odpowiedz.data);
      if (odpowiedz.meta) setMeta(odpowiedz.meta);
    } catch {
      setBlad("Nie udało się wczytać kolejnej strony skrzynki. Spróbuj ponownie.");
    } finally {
      setWczytywanie(false);
    }
  }

  if (stan === "ladowanie") {
    return (
      <Korzen>
        <Heading stopien={1}>Powiadomienia</Heading>
        <Skeleton wiersze={4} />
      </Korzen>
    );
  }
  if (stan === "brak-uprawnien") {
    return (
      <Korzen>
        <Heading stopien={1}>Powiadomienia</Heading>
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Powiadomienia dla administracji"
          rola="administracji"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </Korzen>
    );
  }
  if (stan === "blad") {
    return (
      <Korzen>
        <Heading stopien={1}>Powiadomienia</Heading>
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać wiadomości"
          akcja={
            <Button poziom="outline" onClick={ponowWczytanie}>
              Spróbuj ponownie
            </Button>
          }
        >
          Sprawdź połączenie i spróbuj ponownie.
        </Notice>
      </Korzen>
    );
  }

  const nadawca = meta?.extra?.from;
  const opisNadawcy = nadawca
    ? nadawca.name
      ? `${nadawca.name} <${nadawca.address}>`
      : nadawca.address
    : "brak skonfigurowanego nadawcy";
  const liczbaZmianUstawien =
    ustOstatniOdczyt && ustRoboczy ? liczbaZmian(obliczRoznice(ustOstatniOdczyt, ustRoboczy)) : 0;

  function wierszRodzaju(rodzaj: RodzajPowiadomienia, wlaczony: boolean) {
    return (
      <div key={rodzaj.kod} className={style.wierszRodzaju}>
        <Przelacznik
          id={`typ-${rodzaj.kod}`}
          wlaczony={wlaczony}
          onZmiana={(wartosc) => przelaczTyp(rodzaj.kod, wartosc)}
          etykieta={rodzaj.nazwa}
          opis={rodzaj.kto === "" ? undefined : rodzaj.kto}
          zablokowany={ustTylkoOdczyt}
        />
        {ustBledyTypow[rodzaj.kod] && <ErrorText id={`typ-${rodzaj.kod}-blad`}>{ustBledyTypow[rodzaj.kod]}</ErrorText>}
      </div>
    );
  }

  function blokPrzypomnienia(przypomnienie: UstawieniaPowiadomien["supervision_reminder"]) {
    return (
      <div className={style.blokPrzypomnienia} role="group" aria-label={OPIS_PRZYPOMNIENIA_SUPERWIZJI.nazwa}>
        <Przelacznik
          id="przypomnienie-superwizji"
          wlaczony={przypomnienie.enabled}
          onZmiana={przelaczPrzypomnienie}
          etykieta={OPIS_PRZYPOMNIENIA_SUPERWIZJI.nazwa}
          opis={OPIS_PRZYPOMNIENIA_SUPERWIZJI.kto}
          zablokowany={ustTylkoOdczyt}
        />
        {ustBledyPrzypomnienia.enabled && (
          <ErrorText id="przypomnienie-superwizji-blad">{ustBledyPrzypomnienia.enabled}</ErrorText>
        )}
        <div className={style.godzina}>
          <Field
            id="przypomnienie-godzina"
            etykieta="Godzina wysyłki (UTC)"
            rodzaj="wybor"
            opcje={GODZINY_WYSYLKI}
            wartosc={przypomnienie.send_at}
            onZmiana={zmienGodzinePrzypomnienia}
            zablokowany={!przypomnienie.enabled || ustTylkoOdczyt}
            podpowiedz="Przypomnienie wychodzi raz dziennie, o tej godzinie lub przy pierwszym uruchomieniu po niej."
            blad={ustBledyPrzypomnienia.send_at}
          />
        </div>
      </div>
    );
  }

  function karty(ustawienia: UstawieniaPowiadomien) {
    const wlaczone = new Map(ustawienia.types.map((wpis) => [wpis.type, wpis.enabled]));
    const znaneKody = new Set(KARTY_RODZAJOW.flatMap((karta) => karta.rodzaje.map((rodzaj) => rodzaj.kod)));
    const nieznane = ustawienia.types.filter((wpis) => !znaneKody.has(wpis.type));

    return (
      <>
        {KARTY_RODZAJOW.map((karta) => {
          const obecne = karta.rodzaje.filter((rodzaj) => wlaczone.has(rodzaj.kod));
          if (obecne.length === 0 && !karta.zPrzypomnieniem) return null;
          return (
            <section key={karta.tytul} className={style.karta} aria-label={karta.tytul}>
              <Heading stopien={2}>{karta.tytul}</Heading>
              {obecne.map((rodzaj) => wierszRodzaju(rodzaj, wlaczone.get(rodzaj.kod) === true))}
              {karta.zPrzypomnieniem && blokPrzypomnienia(ustawienia.supervision_reminder)}
            </section>
          );
        })}
        {nieznane.length > 0 && (
          <section className={style.karta} aria-label="Pozostałe">
            <Heading stopien={2}>Pozostałe</Heading>
            {nieznane.map((wpis) =>
              wierszRodzaju({ kod: wpis.type, nazwa: NAZWA_NIEZNANEGO_RODZAJU, kto: "" }, wpis.enabled),
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <Korzen>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Powiadomienia" }]}
        tytul="Powiadomienia"
        onPowrot={() => router.back()}
      />

      <Tabs
        zakladki={[
          { id: "ustawienia", etykieta: "Ustawienia" },
          { id: "wyslane", etykieta: "Wysłane" },
        ]}
        wybranaId={zakladka}
        onWybierz={(id) => setZakladka(id === "wyslane" ? "wyslane" : "ustawienia")}
      />

      {zakladka === "ustawienia" && (
        <div className={style.panel}>
          <Text>
            Wyłączony rodzaj powiadomienia nie tworzy ani wpisu w dzwonku, ani wiadomości e-mail. Osoby mogą dodatkowo
            wyłączyć wiadomości e-mail u siebie, ale tylko w rodzajach włączonych tutaj.
          </Text>

          {ustNoticeUprawnien && (
            <Notice wariant="error" tytul="Nie zapisano ustawień">
              {zdanieOdmowyRoli("administracji")}
            </Notice>
          )}

          {ustBladSieci && (
            <Notice wariant="error" tytul="Nie udało się zapisać">
              {ustBladSieci}
            </Notice>
          )}

          {ustStan === "ladowanie" && <Skeleton wiersze={6} />}

          {ustStan === "blad" && (
            <Notice wariant="error" tytul="Nie udało się wczytać">
              Nie udało się wczytać ustawień powiadomień. Spróbuj ponownie.
            </Notice>
          )}

          {ustStan === "ok" && ustRoboczy && (
            <>
              {karty(ustRoboczy)}

              {!ustTylkoOdczyt && (
                <div className={style.dol}>
                  {zapisano && (
                    <div role="status">
                      <Notice wariant="ok" tytul="Zapisano">
                        Ustawienia powiadomień zostały zapisane.
                      </Notice>
                    </div>
                  )}
                  <div className={style.dolRzad}>
                    <Text>
                      {liczbaZmianUstawien > 0
                        ? `Niezapisane zmiany: ${liczbaZmianUstawien}.`
                        : "Brak niezapisanych zmian."}
                    </Text>
                    <Button
                      poziom="primary"
                      disabled={liczbaZmianUstawien === 0 || ustZapisywanie}
                      onClick={() => {
                        if (!ustZapisywanie) void zapiszUstawienia();
                      }}
                    >
                      Zapisz zmiany
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {zakladka === "wyslane" && (
        <div className={style.panel}>
          <Notice wariant="info" tytul="Zakres tej zakładki">
            {nadawca
              ? `Skonfigurowany nadawca: ${nadawca.name ? `${nadawca.name} <${nadawca.address}>` : nadawca.address}.`
              : "Brak skonfigurowanego nadawcy w tym środowisku."}{" "}
            Wiadomości są tu wyłącznie do odczytu — nie można ich edytować ani wysłać ponownie.
          </Notice>

          {blad && (
            <Notice wariant="error" tytul="Nie udało się wczytać">
              {blad}
            </Notice>
          )}
          {meta && (
            <div>
              <Badge wariant="neutral">{meta.total} łącznie</Badge>
            </div>
          )}

          {wiadomosci.length === 0 ? (
            <Text wariant="pusty">Brak wiadomości.</Text>
          ) : (
            <RecordList
              tytul="Wysłane wiadomości"
              naglowekTylkoDlaCzytnika
              stopienNaglowka={2}
              kolumny={[
                { nazwa: "Do", rodzaj: "tekst" },
                { nazwa: "Temat", rodzaj: "tekst", klucz: "temat" },
                { nazwa: "Status", rodzaj: "stan" },
                { nazwa: "Wysłano", rodzaj: "tekst", klucz: "wyslano" },
                { nazwa: "Podgląd", rodzaj: "akcja" },
              ]}
              wiersze={wierszeListy}
              pusty={{ naglowek: "Brak wiadomości.", tresc: "", przycisk: { etykieta: "Odśwież", onClick: () => void przejdzNaStrone(1) } }}
              naKarcie
            />
          )}

          {meta && (
            <Pagination
              strona={meta.current_page}
              stron={meta.last_page}
              naPoprzednia={() => {
                if (!wczytywanie && meta.current_page > 1) void przejdzNaStrone(meta.current_page - 1);
              }}
              naNastepna={() => {
                if (!wczytywanie && meta.current_page < meta.last_page) void przejdzNaStrone(meta.current_page + 1);
              }}
            />
          )}
        </div>
      )}

      {podglad && <PodgladWiadomosci wiadomosc={podglad} nadawca={opisNadawcy} onZamknij={zamknijPodglad} />}
    </Korzen>
  );
}
