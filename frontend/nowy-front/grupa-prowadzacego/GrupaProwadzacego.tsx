"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { ApiError } from "@/lib/api/klient";
import { rodzajBledu } from "../pulpit/rodzaj-bledu";
import {
  DOMYSLNY_TERMIN,
  PUSTA_SPRAWA,
  pobierzGrupe,
  pobierzRzetelnosc,
  utworzTermin,
  zapiszObecnosci,
  zglosSprawe,
  type Attendance,
  type FormularzSprawy,
  type FormularzTerminu,
  type InstructorGroup,
  type InstructorSlot,
  type OsobaRzetelnosci,
} from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { Komunikat } from "./Komunikat";
import { ListaTerminow } from "./ListaTerminow";
import {
  KOLUMNY_OSOB,
  bledyPolZOdpowiedzi,
  filtrujOsoby,
  komunikatBledu,
  posortujTerminy,
  sprawaZmieniona,
  terminZmieniony,
  wartosciObecnosci,
  wierszeOsob,
  wierszeRzetelnosci,
  zdanieOLiczbieOsob,
  zdanieOWynikachFiltru,
} from "./logika";
import { PanelSprawy } from "./PanelSprawy";
import { PanelTerminu } from "./PanelTerminu";
import style from "./GrupaProwadzacego.module.css";

const TYTUL = "Moja grupa";
const OPIS = "Sprawdzaj postępy osób w grupie i zarządzaj terminami superwizji.";

type StanEkranu = StanBezDanych | "ok";

type Tryb = "przeglad" | "termin" | "sprawa";

type StanRzetelnosci = { rodzaj: "ladowanie" } | { rodzaj: "blad"; komunikat: string } | { rodzaj: "ok"; osoby: OsobaRzetelnosci[] };

/**
 * Ekran „Moja grupa” (prowadzący) na szablonie listy: osoby grupy z postępem (imię, nazwisko i liczby
 * postępu — nic więcej), terminy superwizji z obecnościami i sekcja rzetelności nauki.
 *
 * Te same żądania i ten sam przebieg co stary komponent `InstructorGroup` (`POMIAR-STAREGO-EKRANU.md`).
 * Przycisk główny nagłówka to „Utwórz termin”, obok niego „Zgłoś sprawę”; każdy z nich otwiera w miejscu
 * listy panel z formularzem, a fokus idzie na nagłówek panelu. W otwartym panelu jedynym przyciskiem
 * głównym jest jego przycisk wysyłki. Lista osób nie jest stronicowana, bo serwer zwraca całą grupę.
 */
export function GrupaProwadzacego() {
  const router = useRouter();
  const dziala = useRef(false);

  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [komunikatListy, setKomunikatListy] = useState<string | undefined>(undefined);
  const [grupa, setGrupa] = useState<InstructorGroup | null>(null);
  const [rzetelnosc, setRzetelnosc] = useState<StanRzetelnosci>({ rodzaj: "ladowanie" });
  const [tryb, setTryb] = useState<Tryb>("przeglad");
  const [szukaj, setSzukaj] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [termin, setTermin] = useState<FormularzTerminu>(DOMYSLNY_TERMIN);
  const [bledyTerminu, setBledyTerminu] = useState<Record<string, string[]> | undefined>(undefined);
  const [bladTerminu, setBladTerminu] = useState<string | null>(null);
  const [tworzyTermin, setTworzyTermin] = useState(false);

  const [wybrane, setWybrane] = useState<Record<number, Record<number, Attendance>>>({});
  const [zapisywanyTermin, setZapisywanyTermin] = useState<number | null>(null);
  const [bladObecnosci, setBladObecnosci] = useState<string | null>(null);

  const [sprawa, setSprawa] = useState<FormularzSprawy>(PUSTA_SPRAWA);
  const [bledySprawy, setBledySprawy] = useState<Record<string, string[]> | undefined>(undefined);
  const [bladSprawy, setBladSprawy] = useState<string | null>(null);
  const [zglaszaSprawe, setZglaszaSprawe] = useState(false);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    return pobierzGrupe().then(
      (dane) => {
        if (straz?.anulowane) return;
        setGrupa(dane);
        setStan("ok");
      },
      (wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setKomunikatListy(wyjatek instanceof ApiError ? wyjatek.message : undefined);
        setStan(rodzajBledu(wyjatek));
      },
    );
  }, []);

  const wczytajRzetelnosc = useCallback((straz?: { anulowane: boolean }) => {
    setRzetelnosc({ rodzaj: "ladowanie" });
    return pobierzRzetelnosc().then(
      (osoby) => {
        if (!straz?.anulowane) setRzetelnosc({ rodzaj: "ok", osoby });
      },
      (wyjatek: unknown) => {
        if (!straz?.anulowane) {
          setRzetelnosc({ rodzaj: "blad", komunikat: komunikatBledu(wyjatek, "Nie udało się wczytać danych o rzetelności grupy.") });
        }
      },
    );
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    void wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    void wczytajRzetelnosc(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj, wczytajRzetelnosc]);

  const niezapisane =
    (tryb === "termin" && terminZmieniony(termin)) || (tryb === "sprawa" && sprawaZmieniona(sprawa)) || Object.keys(wybrane).length > 0;
  useZgloszenieNiezapisanychZmian(niezapisane, TYTUL);

  /** Jedno działanie naraz: drugie kliknięcie w trakcie pierwszego niczego nie wysyła. */
  async function uruchom(praca: () => Promise<void>) {
    if (dziala.current) return;
    dziala.current = true;
    try {
      await praca();
    } finally {
      dziala.current = false;
    }
  }

  function zamknijPanel() {
    setTryb("przeglad");
    setTermin(DOMYSLNY_TERMIN);
    setSprawa(PUSTA_SPRAWA);
    setBledyTerminu(undefined);
    setBladTerminu(null);
    setBledySprawy(undefined);
    setBladSprawy(null);
  }

  function otworzPanel(nowy: Exclude<Tryb, "przeglad">) {
    setToast(null);
    setBladObecnosci(null);
    setTryb(nowy);
  }

  function utworz() {
    return uruchom(async () => {
      setTworzyTermin(true);
      setBladTerminu(null);
      setBledyTerminu(undefined);
      try {
        const utworzony = await utworzTermin(termin);
        setGrupa((obecna) => (obecna ? { ...obecna, slots: posortujTerminy([...obecna.slots, utworzony]) } : obecna));
        zamknijPanel();
        setToast("Termin został utworzony.");
      } catch (wyjatek) {
        const bledy = bledyPolZOdpowiedzi(wyjatek);
        setBledyTerminu(bledy);
        setBladTerminu(bledy ? "Popraw zaznaczone pola." : komunikatBledu(wyjatek, "Nie udało się utworzyć terminu."));
      } finally {
        setTworzyTermin(false);
      }
    });
  }

  function zapiszObecnosc(wybranyTermin: InstructorSlot) {
    return uruchom(async () => {
      setZapisywanyTermin(wybranyTermin.id);
      setBladObecnosci(null);
      setToast(null);
      try {
        const zapisany = await zapiszObecnosci(wybranyTermin.id, wartosciObecnosci(wybranyTermin, wybrane));
        setGrupa((obecna) => (obecna ? { ...obecna, slots: obecna.slots.map((element) => (element.id === zapisany.id ? zapisany : element)) } : obecna));
        setWybrane((poprzednie) => {
          const { [wybranyTermin.id]: _zapisane, ...reszta } = poprzednie;
          void _zapisane;
          return reszta;
        });
        setToast("Obecności zostały zapisane.");
      } catch (wyjatek) {
        setBladObecnosci(komunikatBledu(wyjatek, "Nie udało się zapisać obecności."));
      } finally {
        setZapisywanyTermin(null);
      }
    });
  }

  function zglos() {
    return uruchom(async () => {
      setZglaszaSprawe(true);
      setBladSprawy(null);
      setBledySprawy(undefined);
      try {
        await zglosSprawe(sprawa);
        zamknijPanel();
        setToast("Sprawa została zgłoszona do administracji.");
      } catch (wyjatek) {
        const bledy = bledyPolZOdpowiedzi(wyjatek);
        setBledySprawy(bledy);
        setBladSprawy(bledy ? "Popraw zaznaczone pola." : komunikatBledu(wyjatek, "Nie udało się zgłosić sprawy."));
      } finally {
        setZglaszaSprawe(false);
      }
    });
  }

  if (stan !== "ok" || grupa === null) {
    return (
      <EkranStanu
        stan={stan === "ok" ? "ladowanie" : stan}
        tytul={TYTUL}
        opis={OPIS}
        czego="grupy"
        tytulBledu="Nie udało się wczytać grupy"
        czegoNieZnaleziono="grupy"
        komunikat={komunikatListy}
        onPonow={ponow}
      />
    );
  }

  const osoby = grupa.members;
  const widoczne = filtrujOsoby(osoby, szukaj);
  const filtrAktywny = szukaj.trim() !== "";

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: "Prowadzący" }, { etykieta: TYTUL }]}
      tytul={TYTUL}
      opis={OPIS}
      status={{ wariant: "neutral", etykieta: zdanieOLiczbieOsob(osoby.length) }}
      onPowrot={() => router.back()}
      przyciskGlowny={tryb === "przeglad" ? { etykieta: "Utwórz termin", onKliknij: () => otworzPanel("termin") } : undefined}
      akcjaDrugorzedna={tryb === "przeglad" ? { etykieta: "Zgłoś sprawę", onKliknij: () => otworzPanel("sprawa") } : undefined}
    />
  );

  const toastElement = toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />;

  if (tryb === "termin") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <>
            {toastElement}
            <PanelTerminu
              formularz={termin}
              onZmiana={(zmiana) => setTermin((poprzedni) => ({ ...poprzedni, ...zmiana }))}
              bledy={bledyTerminu}
              blad={bladTerminu}
              zapisuje={tworzyTermin}
              onZapisz={() => void utworz()}
              onWroc={zamknijPanel}
            />
          </>
        }
      />
    );
  }

  if (tryb === "sprawa") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <>
            {toastElement}
            <PanelSprawy
              formularz={sprawa}
              osoby={osoby}
              onZmiana={(zmiana) => setSprawa((poprzednia) => ({ ...poprzednia, ...zmiana }))}
              bledy={bledySprawy}
              blad={bladSprawy}
              zglasza={zglaszaSprawe}
              onZglos={() => void zglos()}
              onWroc={zamknijPanel}
            />
          </>
        }
      />
    );
  }

  const filtry =
    osoby.length > 0 ? (
      <div className={style.sekcja}>
        <Field
          id="grupa-szukaj"
          etykieta="Szukaj osoby"
          rodzaj="tekst"
          placeholder="Imię lub nazwisko"
          wartosc={szukaj}
          onZmiana={setSzukaj}
          podpowiedz={filtrAktywny ? zdanieOWynikachFiltru(widoczne.length, osoby.length) : undefined}
        />
      </div>
    ) : undefined;

  return (
    <ListTemplate
      naglowek={naglowek}
      filtry={filtry}
      lista={
        <div className={style.stos}>
          {toastElement}
          {bladObecnosci !== null && (
            <Komunikat wariant="error" tytul="Nie udało się zapisać obecności">
              {bladObecnosci}
            </Komunikat>
          )}

          <RecordList
            tytul="Uczestnicy"
            stopienNaglowka={2}
            naKarcie
            kolumny={KOLUMNY_OSOB}
            wiersze={wierszeOsob(widoczne)}
            pusty={
              filtrAktywny
                ? {
                    naglowek: "Brak osób spełniających filtr",
                    tresc: "Zmień szukaną frazę albo wyczyść filtr.",
                    przycisk: { etykieta: "Wyczyść filtr", onClick: () => setSzukaj("") },
                  }
                : {
                    naglowek: "Nie masz jeszcze przypisanej grupy",
                    tresc: "Osoby do grupy przypisuje administracja Fundacji. Gdy dostaniesz pierwszą osobę, pojawi się tutaj.",
                    przycisk: { etykieta: "Odśwież", onClick: ponow },
                  }
            }
          />

          <section className={style.sekcja} aria-labelledby="grupa-terminy-naglowek">
            <Heading stopien={2} id="grupa-terminy-naglowek">
              Terminy i obecności
            </Heading>
            {grupa.slots.length === 0 ? (
              <Text wariant="pusty">Nie masz jeszcze żadnego terminu. Utwórz pierwszy przyciskiem „Utwórz termin” u góry strony.</Text>
            ) : (
              <ListaTerminow
                terminy={grupa.slots}
                wybrane={wybrane}
                zapisywanyTermin={zapisywanyTermin}
                onWybierz={(idTerminu, idOsoby, wartosc) => {
                  setToast(null);
                  setWybrane((poprzednie) => ({ ...poprzednie, [idTerminu]: { ...poprzednie[idTerminu], [idOsoby]: wartosc } }));
                }}
                onZapisz={(wybranyTermin) => void zapiszObecnosc(wybranyTermin)}
              />
            )}
          </section>

          <SekcjaRzetelnosci stan={rzetelnosc} onPonow={() => void wczytajRzetelnosc()} />
        </div>
      }
    />
  );
}

function SekcjaRzetelnosci({ stan, onPonow }: { stan: StanRzetelnosci; onPonow: () => void }): ReactNode {
  if (stan.rodzaj === "ladowanie") {
    return (
      <section className={style.sekcja} aria-labelledby="grupa-rzetelnosc-naglowek">
        <Heading stopien={2} id="grupa-rzetelnosc-naglowek">
          Rzetelność nauki
        </Heading>
        <p role="status" className={style.stanPusty}>
          Wczytywanie rzetelności grupy…
        </p>
        <Skeleton wiersze={2} />
      </section>
    );
  }
  if (stan.rodzaj === "blad") {
    return (
      <section className={style.sekcja} aria-labelledby="grupa-rzetelnosc-naglowek">
        <Heading stopien={2} id="grupa-rzetelnosc-naglowek">
          Rzetelność nauki
        </Heading>
        <Komunikat
          wariant="error"
          stopien={3}
          tytul="Nie udało się wczytać sekcji"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.komunikat}
        </Komunikat>
      </section>
    );
  }
  return (
    <RecordList
      tytul="Rzetelność nauki"
      stopienNaglowka={2}
      wiersze={wierszeRzetelnosci(stan.osoby)}
      pusty={{
        naglowek: "Brak wyników rzetelności",
        tresc: "Nie masz obecnie przypisanych osób w grupie.",
        przycisk: { etykieta: "Odśwież", onClick: onPonow },
      }}
    />
  );
}
