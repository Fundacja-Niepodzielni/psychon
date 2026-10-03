"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { KeyValueRow } from "@/design-system/molekuly/KeyValueRow/KeyValueRow";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import { SCIEZKA_KARTY } from "@/nowy-front/osoby-lista/dane";
import { formatujDateICzas } from "@/nowy-front/wspolne/daty";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import {
  ETYKIETA_STANU,
  KOMUNIKAT_BLEDU_LISTY,
  PUSTY_FILTR,
  WARIANT_STANU,
  filtrAktywny,
  oczyscFiltr,
  pobierzCertyfikaty,
  rodzajBledu,
  zdanieSerwera,
  type CertyfikatNaLiscie,
  type FiltrCertyfikatow,
} from "./dane";
import { OknoUniewaznienia } from "./OknoUniewaznienia";
import { TabelaWierszy, type KolumnaTabeli, type WierszTabeli } from "@/design-system/organizmy/TabelaWierszy/TabelaWierszy";
import style from "./CertyfikatyLista.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; certyfikaty: CertyfikatNaLiscie[]; meta: PaginationMeta | undefined }
  | { rodzaj: "brak-uprawnien" }
  /** Odpowiedź serwera z błędem — zdanie serwera (jak na starym ekranie) albo zdanie zastępcze. */
  | { rodzaj: "blad"; komunikat: string }
  | { rodzaj: "siec" };

interface Zapytanie {
  filtr: FiltrCertyfikatow;
  strona: number;
  /** Rośnie przy każdym ponowieniu, żeby to samo zapytanie wczytało się jeszcze raz. */
  proba: number;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Certyfikaty" }];

const KOLUMNY: KolumnaTabeli[] = [
  { nazwa: "Osoba", rodzaj: "nazwa" },
  { nazwa: "Numer", rodzaj: "tekst" },
  { nazwa: "Rok programu", rodzaj: "tekst" },
  { nazwa: "Wydano", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Akcje", rodzaj: "akcje" },
];

const SIATKA = "minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 1.3fr) max-content max-content";

function liczbaCertyfikatow(liczba: number): string {
  return `${liczba} ${odmien(liczba, "certyfikat", "certyfikaty", "certyfikatów")}`;
}

function imieNazwisko(certyfikat: CertyfikatNaLiscie): string | null {
  return certyfikat.user === null ? null : `${certyfikat.user.first_name} ${certyfikat.user.last_name}`;
}

const idPrzyciskuSzczegolow = (id: number) => `certyfikat-szczegoly-${id}`;
const idPrzyciskuUniewaznienia = (id: number) => `certyfikat-uniewaznij-${id}`;
const idPaneluSzczegolow = (id: number) => `certyfikat-panel-${id}`;

function SzczegolyCertyfikatu({ certyfikat }: { certyfikat: CertyfikatNaLiscie }) {
  const osoba = imieNazwisko(certyfikat);
  const uniewazniony = certyfikat.status === "revoked";
  // Powód tylko wtedy, gdy przyszedł w odpowiedzi — lista nie może od niego zależeć.
  const powod = typeof certyfikat.revoked_reason === "string" && certyfikat.revoked_reason.trim() !== "" ? certyfikat.revoked_reason : null;
  return (
    <div className={style.szczegoly}>
      <Heading stopien={3}>{`Szczegóły certyfikatu ${certyfikat.number}`}</Heading>
      <KeyValueRow etykieta="Numer" wartosc={certyfikat.number} />
      <KeyValueRow etykieta="Osoba" wartosc={osoba ?? ""} />
      <KeyValueRow etykieta="Rok programu" wartosc={certyfikat.edition ?? ""} />
      <KeyValueRow etykieta="Wydano" wartosc={formatujDateICzas(certyfikat.issued_at)} />
      <KeyValueRow etykieta="Stan" wartosc={ETYKIETA_STANU[certyfikat.status]} />
      {uniewazniony && (
        <>
          <KeyValueRow etykieta="Unieważniono" wartosc={formatujDateICzas(certyfikat.revoked_at)} />
          {powod !== null && <KeyValueRow etykieta="Powód unieważnienia" wartosc={powod} />}
        </>
      )}
    </div>
  );
}

/**
 * Ekran „Certyfikaty” — lista wydanych certyfikatów i ich unieważnianie
 * (administracja), na szablonie `ListTemplate`. Trasy: `GET /admin/certificates`
 * (lista z filtrem po numerze i po osobie) i `POST /admin/certificates/{id}/revoke`
 * (`OknoUniewaznienia`). Wiersz: nazwa osoby jako odnośnik do jej karty, numer,
 * rok programu, data wydania, stan słowami („ważny”, „unieważniony”) i akcje.
 * „Unieważnij” stoi w wierszu certyfikatu, którego dotyczy, i otwiera okno z
 * powodem (wspólne okno formularza `Dialog`, wariant „niebezpieczny”). Powód
 * unieważnionego certyfikatu nie stoi w wierszu — pokazuje go dopiero panel
 * „Szczegóły” tego certyfikatu (dane z listy, bez dodatkowego żądania), i to
 * tylko wtedy, gdy odpowiedź listy go niesie: bez pola `revoked_reason` lista
 * i szczegóły działają, a wiersza powodu nie ma.
 * Stany: ładowanie, dane, dwa różne stany puste (z filtrem i bez), brak
 * uprawnień (wspólny ekran odmowy), błąd odpowiedzi serwera (ze zdaniem
 * serwera, jak na starym ekranie) i brak połączenia.
 * Po unieważnieniu pokazuje się wspólny pasek potwierdzenia (`Toast`, jak na
 * karcie osoby — obok szablonu, nie w jego slocie), lista wczytuje się
 * od nowa bez szkieletu, żeby fokus nie zniknął, a fokus wraca na przycisk
 * szczegółów tego certyfikatu.
 */
export function CertyfikatyLista() {
  const router = useRouter();
  const [formularz, setFormularz] = useState<FiltrCertyfikatow>(PUSTY_FILTR);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ filtr: PUSTY_FILTR, strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [otwarty, setOtwarty] = useState<number | null>(null);
  const [uniewaznianie, setUniewaznianie] = useState<CertyfikatNaLiscie | null>(null);
  const [sukces, setSukces] = useState<string | null>(null);
  const celFokusu = useRef<string | null>(null);
  const zamknijSukces = useCallback(() => setSukces(null), []);

  useEffect(() => {
    let anulowane = false;
    pobierzCertyfikaty(zapytanie.filtr, zapytanie.strona)
      .then(({ data, meta }) => {
        if (!anulowane) setStan({ rodzaj: "dane", certyfikaty: data, meta });
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        const rodzaj = rodzajBledu(wyjatek);
        setStan(rodzaj === "blad" ? { rodzaj, komunikat: zdanieSerwera(wyjatek) ?? KOMUNIKAT_BLEDU_LISTY } : { rodzaj });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  // Po rezygnacji fokus oddaje wspólne okno (przycisk, który je otworzył). Po
  // unieważnieniu ekran przenosi fokus na przycisk szczegółów tego samego
  // certyfikatu — przycisk „Unieważnij” znika razem ze stanem „ważny”.
  useEffect(() => {
    const cel = celFokusu.current;
    if (cel === null) return;
    celFokusu.current = null;
    document.getElementById(cel)?.focus();
  });

  function przejdz(filtr: FiltrCertyfikatow, strona: number, cicho = false) {
    if (!cicho) {
      setStan({ rodzaj: "ladowanie" });
      setOtwarty(null);
    }
    setZapytanie((poprzednie) => ({ filtr, strona, proba: poprzednie.proba + 1 }));
  }

  function zastosujFiltr(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    const filtr = oczyscFiltr(formularz);
    setFormularz(filtr);
    przejdz(filtr, 1);
  }

  function wyczyscFiltr() {
    setFormularz(PUSTY_FILTR);
    przejdz(PUSTY_FILTR, 1);
  }

  function otworzUniewaznienie(certyfikat: CertyfikatNaLiscie) {
    setSukces(null);
    setUniewaznianie(certyfikat);
  }

  function zamknijUniewaznienie() {
    setUniewaznianie(null);
  }

  function poUniewaznieniu(certyfikat: CertyfikatNaLiscie) {
    celFokusu.current = idPrzyciskuSzczegolow(certyfikat.id);
    setUniewaznianie(null);
    setSukces(`Certyfikat ${certyfikat.number} jest teraz unieważniony.`);
    przejdz(zapytanie.filtr, zapytanie.strona, true);
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const aktywny = filtrAktywny(zapytanie.filtr);
  const opis =
    meta === undefined
      ? "Wydane certyfikaty ukończenia programu i ich unieważnianie."
      : aktywny
        ? `Pasujące do filtra: ${liczbaCertyfikatow(meta.total)}.`
        : `Wydane certyfikaty ukończenia programu i ich unieważnianie. Razem: ${liczbaCertyfikatow(meta.total)}.`;

  const naglowek = <PageHeader okruszki={OKRUSZKI} tytul="Certyfikaty" opis={opis} onPowrot={() => router.back()} />;

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EkranOdmowy
            rodzaj="brak-dostepu"
            stopien={2}
            rolaDocelowa="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const filtry = (
    <form className={style.filtry} onSubmit={zastosujFiltr} aria-label="Filtr certyfikatów">
      <div className={style.pole}>
        <Field
          id="certyfikaty-numer"
          etykieta="Numer certyfikatu"
          rodzaj="tekst"
          placeholder="Cały numer, np. NP/2026/017"
          wartosc={formularz.number}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, number: wartosc }))}
        />
      </div>
      <div className={style.pole}>
        <Field
          id="certyfikaty-osoba"
          etykieta="Osoba"
          rodzaj="tekst"
          placeholder="Imię, nazwisko lub e-mail"
          wartosc={formularz.person}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, person: wartosc }))}
        />
      </div>
      <Button poziom="outline" type="submit">
        Filtruj
      </Button>
      {aktywny && (
        <Button poziom="outline" type="button" onClick={wyczyscFiltr}>
          Wyczyść filtr
        </Button>
      )}
    </form>
  );

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={5} />;
  } else if (stan.rodzaj === "siec" || stan.rodzaj === "blad") {
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Lista certyfikatów</Heading>
        </div>
        <Notice
          wariant="error"
          tytul={stan.rodzaj === "siec" ? "Brak połączenia z serwerem" : "Nie udało się wczytać listy certyfikatów"}
          akcja={
            <Button poziom="outline" onClick={() => przejdz(zapytanie.filtr, zapytanie.strona)}>
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.rodzaj === "siec" ? "Sprawdź połączenie z internetem i spróbuj jeszcze raz." : stan.komunikat}
        </Notice>
      </div>
    );
  } else if (stan.certyfikaty.length === 0 && aktywny) {
    lista = (
      <EmptyState
        wariant="brak-wynikow-filtra"
        naglowek="Brak certyfikatów spełniających filtr"
        tresc="Zmień numer albo osobę, albo wróć do wszystkich certyfikatów."
        przycisk={{ etykieta: "Pokaż wszystkie certyfikaty", onClick: wyczyscFiltr }}
      />
    );
  } else if (stan.certyfikaty.length === 0) {
    lista = (
      <EmptyState
        naglowek="Nie wydano jeszcze certyfikatów"
        tresc="Certyfikat pojawi się tu, gdy osoba spełni warunki ukończenia programu."
        przycisk={{ etykieta: "Wczytaj listę ponownie", onClick: () => przejdz(zapytanie.filtr, zapytanie.strona) }}
      />
    );
  } else {
    const wiersze: WierszTabeli[] = stan.certyfikaty.map((certyfikat) => {
      const osoba = imieNazwisko(certyfikat);
      const rozwiniety = otwarty === certyfikat.id;
      return {
        id: String(certyfikat.id),
        komorki: [
          certyfikat.user === null || osoba === null ? "—" : <Link key="osoba" href={`${SCIEZKA_KARTY}/${certyfikat.user.id}`}>{osoba}</Link>,
          certyfikat.number,
          certyfikat.edition ?? "—",
          formatujDateICzas(certyfikat.issued_at),
          <Badge key="stan" wariant={WARIANT_STANU[certyfikat.status]}>
            {ETYKIETA_STANU[certyfikat.status]}
          </Badge>,
          <Fragment key="akcje">
            <Button
              poziom="outline"
              rozmiar="sm"
              id={idPrzyciskuSzczegolow(certyfikat.id)}
              aria-expanded={rozwiniety}
              aria-controls={rozwiniety ? idPaneluSzczegolow(certyfikat.id) : undefined}
              aria-label={`${rozwiniety ? "Ukryj szczegóły" : "Szczegóły"}: certyfikat ${certyfikat.number}`}
              onClick={() => setOtwarty(rozwiniety ? null : certyfikat.id)}
            >
              {rozwiniety ? "Ukryj szczegóły" : "Szczegóły"}
            </Button>
            {certyfikat.status === "valid" && (
              <Button
                poziom="outline"
                rozmiar="sm"
                niebezpieczny
                id={idPrzyciskuUniewaznienia(certyfikat.id)}
                aria-label={`Unieważnij certyfikat ${certyfikat.number}`}
                onClick={() => otworzUniewaznienie(certyfikat)}
              >
                Unieważnij
              </Button>
            )}
          </Fragment>,
        ],
        panel: rozwiniety ? <SzczegolyCertyfikatu certyfikat={certyfikat} /> : undefined,
        idPanelu: rozwiniety ? idPaneluSzczegolow(certyfikat.id) : undefined,
      };
    });
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Lista certyfikatów</Heading>
        </div>
        <TabelaWierszy tytul="Lista certyfikatów" kolumny={KOLUMNY} wiersze={wiersze} siatka={SIATKA} />
      </div>
    );
  }

  const stronicowanie =
    meta !== undefined && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => przejdz(zapytanie.filtr, meta.current_page - 1)}
        naNastepna={() => przejdz(zapytanie.filtr, meta.current_page + 1)}
      />
    ) : undefined;

  return (
    <>
      <ListTemplate naglowek={naglowek} filtry={filtry} lista={lista} stronicowanie={stronicowanie} />
      {sukces !== null && <Toast komunikat={sukces} onZamknij={zamknijSukces} />}
      {uniewaznianie !== null && (
        <OknoUniewaznienia
          key={uniewaznianie.id}
          certyfikat={uniewaznianie}
          onZamknij={zamknijUniewaznienie}
          onUniewazniono={poUniewaznieniu}
          fokusPoZamknieciu={idPrzyciskuSzczegolow(uniewaznianie.id)}
        />
      )}
    </>
  );
}
