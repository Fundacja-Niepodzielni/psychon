"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Checkbox } from "@/design-system/atomy/Checkbox/Checkbox";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { DataTable, type WierszDataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { Field } from "@/design-system/molekuly/Field/Field";
import { EmptyState, zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { SaveBar } from "@/design-system/molekuly/SaveBar/SaveBar";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { ApiError } from "@/lib/api/klient";
import { fetchAdminEmailsPage } from "@/lib/api/h16-emails";
import { formatujDateICzas } from "../wspolne/daty";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  type PatchUstawienPowiadomien,
  type UstawieniaPowiadomien,
} from "@/lib/api/h16-ustawienia";
import type { MetaSkrzynki, WiadomoscEmail } from "./dane";

/**
 * Pole „Kontakt w e-mailach” (`email_contact`) z odpowiedzi i ciała PATCH
 * `/admin/notification-settings` — typy klienta `@/lib/api/h16-ustawienia`
 * go nie znają, więc ekran rozszerza je tutaj. Brak pola w odpowiedzi
 * traktujemy jak pusty kontakt.
 */
type UstawieniaZKontaktem = UstawieniaPowiadomien & { email_contact?: string | null };
type PatchZKontaktem = PatchUstawienPowiadomien & { email_contact?: string };

function kontaktZ(ustawienia: UstawieniaZKontaktem): string {
  return ustawienia.email_contact ?? "";
}
import style from "./PowiadomieniaEmail.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";

const ETYKIETY_STATUSU: Record<WiadomoscEmail["status"], string> = {
  queued: "W kolejce",
  sent: "Wysłany",
  failed: "Nieudany",
  simulated: "Symulowany",
};

/**
 * Mapa etykiet typów powiadomień (UI po polsku, klucze = kody z kontraktu
 * §3.1, rozszerzona o trzy kody z ANEKSU 1/2 pisma zdawczego — 20 pozycji,
 * zgodnie z `NotificationSettings::TYPES` na zapleczu). Typ spoza tej mapy
 * (np. przyszłe rozszerzenie kontraktu, którego front jeszcze nie zna) nie
 * jest błędem — pokazuje się jego surowy kod, patrz `etykietaTypu` niżej.
 */
const ETYKIETY_TYPOW: Record<string, string> = {
  "application.accepted": "Zgłoszenie zatwierdzone",
  "application.rejected": "Zgłoszenie odrzucone — notatka dla osoby decydującej (e-mail z powodem do kandydata wychodzi zawsze)",
  "assignment.created": "Przypisanie prowadzącego",
  "assignment.removed": "Usunięcie przypisania prowadzącego",
  "course.invited": "Zaproszenie na kurs",
  "course.unlocked": "Odblokowanie etapu",
  "question.asked": "Nowe pytanie",
  "question.answered": "Odpowiedź na pytanie",
  "internship.accepted": "Wpis stażu zatwierdzony",
  "internship.returned": "Wpis stażu do poprawki",
  "internship.rejected": "Wpis stażu odrzucony",
  "attempt.failed_final": "Ostatnie niezaliczone podejście do testu",
  "certificate.ready": "Certyfikat gotowy",
  "document.ready": "Dokument gotowy",
  "profile.accepted": "Profil psychologa zatwierdzony",
  "profile.returned": "Profil psychologa do poprawki",
  "profile.withdrawn": "Profil psychologa wycofany",
  "export.ready": "Eksport danych gotowy",
  "cooperation_request.answered": "Odpowiedź na prośbę o dalszą współpracę",
  "supervision.slot_cancelled": "Termin superwizji odwołany",
  "access.expiring_7d": "Dostęp kończy się za 7 dni",
  "access.expired": "Dostęp do materiałów się zakończył",
  "cooperation_request.created": "Nowe zgłoszenie dalszej współpracy",
};

function etykietaTypu(kod: string): string {
  return ETYKIETY_TYPOW[kod] ?? "Inne powiadomienie";
}

/** 24 opcje `00:00`…`23:00` — wartość zawsze pełna godzina, bez minut. */
const GODZINY_WYSYLKI = Array.from({ length: 24 }, (_, godzina) => {
  const etykieta = `${String(godzina).padStart(2, "0")}:00`;
  return { wartosc: etykieta, etykieta };
});

type StanUstawien = "ladowanie" | "blad" | "ok";

/** Różnica robocza vs. ostatni odczyt → kształt PATCH z kontraktu (WYŁĄCZNIE
 * zmienione pola). */
function obliczRoznice(
  bazowy: UstawieniaZKontaktem,
  roboczy: UstawieniaZKontaktem,
): PatchZKontaktem {
  const bazoweTypy = new Map(bazowy.types.map((wpis) => [wpis.type, wpis.enabled]));
  const zmienioneTypy = roboczy.types.filter((wpis) => bazoweTypy.get(wpis.type) !== wpis.enabled);

  const zmienionePrzypomnienie: Partial<UstawieniaPowiadomien["supervision_reminder"]> = {};
  if (bazowy.supervision_reminder.enabled !== roboczy.supervision_reminder.enabled) {
    zmienionePrzypomnienie.enabled = roboczy.supervision_reminder.enabled;
  }
  if (bazowy.supervision_reminder.send_at !== roboczy.supervision_reminder.send_at) {
    zmienionePrzypomnienie.send_at = roboczy.supervision_reminder.send_at;
  }

  const patch: PatchZKontaktem = {};
  if (zmienioneTypy.length > 0) patch.types = zmienioneTypy;
  if (Object.keys(zmienionePrzypomnienie).length > 0) patch.supervision_reminder = zmienionePrzypomnienie;
  if (kontaktZ(bazowy) !== kontaktZ(roboczy)) patch.email_contact = kontaktZ(roboczy);
  return patch;
}

function liczbaZmian(patch: PatchZKontaktem): number {
  return (
    (patch.types?.length ?? 0) +
    Object.keys(patch.supervision_reminder ?? {}).length +
    (patch.email_contact === undefined ? 0 : 1)
  );
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
 * całej skrzynki, którego backend nie robi. `DataTable` (O3) ma `szukajka`
 * opcjonalną właśnie dla takich tras.
 *
 * Nad skrzynką (bez zmiany jej zachowania) stoi sekcja „Ustawienia
 * powiadomień” (`GET`/`PATCH /admin/notification-settings`,
 * `backend/routes/api/h16.php:38-39`) — przełączniki typów z kontraktu
 * §3.1 (`Checkbox`) i blok przypomnienia o superwizji (`Checkbox` + `Field`
 * z `Select` na godzinę). Stan tej sekcji jest niezależny od skrzynki: własne
 * `ladowanie`/`blad`/`ok`, własny `SaveBar` z liczbą niezapisanych zmian.
 * `PATCH` wysyła wyłącznie zmienione pola (`obliczRoznice` wyżej) — pełny
 * stan z odpowiedzi zastępuje stan roboczy i ostatni odczyt naraz.
 *
 * Pod przypomnieniem stoi pole „Kontakt w e-mailach” (`email_contact`) —
 * tekst linii „Kontakt z Fundacją” w stopce e-maili. Puste pole zapisuje
 * brak kontaktu: e-maile pomijają wtedy tę linię.
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
  const [toast, setToast] = useState<string | null>(null);

  const [ustStan, setUstStan] = useState<StanUstawien>("ladowanie");
  const [ustOstatniOdczyt, setUstOstatniOdczyt] = useState<UstawieniaZKontaktem | null>(null);
  const [ustRoboczy, setUstRoboczy] = useState<UstawieniaZKontaktem | null>(null);
  const [ustTylkoOdczyt, setUstTylkoOdczyt] = useState(false);
  const [ustNoticeUprawnien, setUstNoticeUprawnien] = useState(false);
  const [ustBladSieci, setUstBladSieci] = useState<string | null>(null);
  const [ustBledyTypow, setUstBledyTypow] = useState<Record<string, string>>({});
  const [ustBledyPrzypomnienia, setUstBledyPrzypomnienia] = useState<{ enabled?: string; send_at?: string }>({});
  const [ustBladKontaktu, setUstBladKontaktu] = useState<string | undefined>(undefined);
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

  // Atom `Checkbox` (design-system/atomy/Checkbox) nie przyjmuje `disabled` —
  // tryb tylko-do-odczytu po 403 działa więc przez zignorowanie zmiany w
  // obsłudze zdarzenia, nie przez blokadę kontrolki (ten sam rodzaj
  // ograniczenia atomu, jaki `Field.tsx` opisuje wprost dla `Select` i
  // `aria-describedby` — atom NIE zmieniony). `Select` (przez `Field`) ma
  // `disabled`, więc godzina wysyłki jest blokowana naprawdę.
  function przelaczTyp(kod: string, wartosc: boolean) {
    if (ustTylkoOdczyt) return;
    setUstRoboczy((roboczy) =>
      roboczy && {
        ...roboczy,
        types: roboczy.types.map((wpis) => (wpis.type === kod ? { ...wpis, enabled: wartosc } : wpis)),
      },
    );
  }

  function przelaczPrzypomnienie(wartosc: boolean) {
    if (ustTylkoOdczyt) return;
    setUstRoboczy(
      (roboczy) => roboczy && { ...roboczy, supervision_reminder: { ...roboczy.supervision_reminder, enabled: wartosc } },
    );
  }

  function zmienGodzinePrzypomnienia(wartosc: string) {
    if (ustTylkoOdczyt) return;
    setUstRoboczy(
      (roboczy) => roboczy && { ...roboczy, supervision_reminder: { ...roboczy.supervision_reminder, send_at: wartosc } },
    );
  }

  function zmienKontakt(wartosc: string) {
    if (ustTylkoOdczyt) return;
    setUstRoboczy((roboczy) => roboczy && { ...roboczy, email_contact: wartosc });
  }

  function odrzucUstawienia() {
    if (!ustOstatniOdczyt) return;
    setUstRoboczy(ustOstatniOdczyt);
    setUstBledyTypow({});
    setUstBledyPrzypomnienia({});
    setUstBladKontaktu(undefined);
    setUstBladSieci(null);
  }

  async function zapiszUstawienia() {
    if (!ustOstatniOdczyt || !ustRoboczy) return;
    const patch = obliczRoznice(ustOstatniOdczyt, ustRoboczy);
    if (liczbaZmian(patch) === 0) return;

    setUstZapisywanie(true);
    setToast(null);
    setUstBladSieci(null);
    setUstBledyTypow({});
    setUstBledyPrzypomnienia({});
    setUstBladKontaktu(undefined);
    try {
      const odpowiedz: UstawieniaZKontaktem = await updateNotificationSettings(patch);
      setUstOstatniOdczyt(odpowiedz);
      setUstRoboczy(odpowiedz);
      setToast("Ustawienia powiadomień zapisane.");
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
          if (klucz === "email_contact") setUstBladKontaktu(tresc);
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

  const wierszeTabeli: WierszDataTable[] = useMemo(
    () =>
      wiadomosci.map((wiadomosc) => ({
        id: String(wiadomosc.id),
        wartosci: {
          do_email: wiadomosc.to_email,
          temat: wiadomosc.subject,
          status: ETYKIETY_STATUSU[wiadomosc.status],
          wyslano: formatujDateICzas(wiadomosc.sent_at),
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
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
        <Skeleton wiersze={4} />
      </main>
    );
  }
  if (stan === "brak-uprawnien") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Powiadomienia e-mail dla administracji"
          rola="administracji"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </main>
    );
  }
  if (stan === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
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
      </main>
    );
  }

  const nadawca = meta?.extra?.from;

  return (
    <main id="tresc" className={style.uklad}>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Powiadomienia e-mail" }]}
        tytul="Powiadomienia e-mail"
        opis="Tryb próbny — e-maile nie wychodzą poza system."
        onPowrot={() => router.back()}
      />

      <section className={style.ustawienia} aria-label="Ustawienia powiadomień">
        <Heading stopien={2}>Ustawienia powiadomień</Heading>

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
            <div className={style.listaTypow} role="group" aria-label="Typy powiadomień">
              {ustRoboczy.types.map((wpis) => (
                <div key={wpis.type} className={style.wierszTypu}>
                  <Checkbox
                    id={`typ-${wpis.type}`}
                    zaznaczony={wpis.enabled}
                    onZmiana={(wartosc) => przelaczTyp(wpis.type, wartosc)}
                    etykieta={etykietaTypu(wpis.type)}
                  />
                  {ustBledyTypow[wpis.type] && (
                    <ErrorText id={`typ-${wpis.type}-blad`}>{ustBledyTypow[wpis.type]}</ErrorText>
                  )}
                </div>
              ))}
            </div>

            <div className={style.przypomnienie}>
              <Checkbox
                id="przypomnienie-superwizji"
                zaznaczony={ustRoboczy.supervision_reminder.enabled}
                onZmiana={przelaczPrzypomnienie}
                etykieta="Wysyłaj przypomnienia o superwizji"
              />
              {ustBledyPrzypomnienia.enabled && (
                <ErrorText id="przypomnienie-superwizji-blad">{ustBledyPrzypomnienia.enabled}</ErrorText>
              )}
              <Field
                id="przypomnienie-godzina"
                etykieta="Godzina wysyłki"
                rodzaj="wybor"
                opcje={GODZINY_WYSYLKI}
                wartosc={ustRoboczy.supervision_reminder.send_at}
                onZmiana={zmienGodzinePrzypomnienia}
                zablokowany={!ustRoboczy.supervision_reminder.enabled || ustTylkoOdczyt}
                podpowiedz="Przypomnienie wychodzi raz dziennie, o tej godzinie lub przy pierwszym uruchomieniu po niej."
                blad={ustBledyPrzypomnienia.send_at}
              />
            </div>

            <div className={style.kontakt}>
              <Field
                id="kontakt-w-emailach"
                etykieta="Kontakt w e-mailach"
                rodzaj="tekst"
                wartosc={kontaktZ(ustRoboczy)}
                onZmiana={zmienKontakt}
                zablokowany={ustTylkoOdczyt}
                podpowiedz="Pojawia się w stopce e-maili jako „Kontakt z Fundacją”, np. adres e-mail i telefon. Puste pole: e-maile nie pokażą kontaktu."
                blad={ustBladKontaktu}
              />
            </div>
          </>
        )}
      </section>

      {ustStan === "ok" && ustOstatniOdczyt && ustRoboczy && !ustTylkoOdczyt && (
        <SaveBar
          liczbaZmian={liczbaZmian(obliczRoznice(ustOstatniOdczyt, ustRoboczy))}
          temat="Ustawienia powiadomień"
          onCofnij={odrzucUstawienia}
          onPorzucWszystko={odrzucUstawienia}
          onZapisz={() => {
            if (!ustZapisywanie) void zapiszUstawienia();
          }}
        />
      )}

      <Notice wariant="info" tytul="Zakres tego ekranu">
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

      <DataTable
        tytul="Wysłane wiadomości"
        kolumny={[
          { klucz: "do_email", etykieta: "Do" },
          { klucz: "temat", etykieta: "Temat" },
          { klucz: "status", etykieta: "Status" },
          { klucz: "wyslano", etykieta: "Wysłano" },
        ]}
        wiersze={wierszeTabeli}
        stronicowanie={
          meta
            ? {
                strona: meta.current_page,
                stron: meta.last_page,
                naPoprzednia: () => {
                  if (!wczytywanie && meta.current_page > 1) void przejdzNaStrone(meta.current_page - 1);
                },
                naNastepna: () => {
                  if (!wczytywanie && meta.current_page < meta.last_page)
                    void przejdzNaStrone(meta.current_page + 1);
                },
              }
            : undefined
        }
        komunikatPusty="Brak wiadomości."
      />
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </main>
  );
}
