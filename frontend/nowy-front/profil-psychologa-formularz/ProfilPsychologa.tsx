"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Checkbox } from "@/design-system/atomy/Checkbox/Checkbox";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { FileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { ApiError } from "@/lib/api/klient";
import { rodzajBledu } from "../pulpit/rodzaj-bledu";
import {
  dodajZalacznik,
  formularzZWniosku,
  pobierzWniosek,
  PUSTY_FORMULARZ,
  wycofajZgode,
  zapiszWniosek,
  zlozWniosek,
  type FormularzWniosku,
  type ProfileDocumentType,
  type Wniosek,
} from "./dane";
import { EkranStanu, TYTUL_EKRANU, type StanBezDanych } from "./EkranStanu";
import { Komunikat } from "./Komunikat";
import {
  bladPola,
  brakiWniosku,
  czyEdytowalny,
  czyMoznaWycofac,
  czyZmieniony,
  ETYKIETY_ZALACZNIKOW,
  komunikatBledu,
  opisStanu,
  opisZalacznika,
  rodzajStanu,
  TYPY_ZALACZNIKOW,
  zdanieOBrakach,
  zdanieOZalacznikach,
} from "./logika";
import style from "./ProfilPsychologa.module.css";

type StanEkranu = StanBezDanych | "ok";

type Dzialanie = "zapis" | "zalacznik" | "wyslanie" | "wycofanie";

interface BladAkcji {
  tytul: string;
  tresc: string;
}

/** Nazwy pól do podsumowania błędów serwera: klucz odpowiedzi → etykieta pola. */
const POLA_FORMULARZA: Array<{ klucz: string; pole: keyof FormularzWniosku; etykieta: string }> = [
  { klucz: "specializations", pole: "specjalizacje", etykieta: "Specjalizacje" },
  { klucz: "approach", pole: "nurt", etykieta: "Nurt terapeutyczny" },
  { klucz: "city", pole: "miasto", etykieta: "Miasto" },
  { klucz: "bio", pole: "opis", etykieta: "Opis" },
];

/**
 * Ekran „Profil psychologa” uczestnika na szablonie formularza: nagłówek z jedynym zielonym
 * przyciskiem, blok stanu wniosku (nazwa stanu, co znaczy, uwagi osoby sprawdzającej, co dalej),
 * a pod nim białe karty: dane wniosku, załączniki i zgoda na publikację.
 *
 * Te same żądania i ten sam przebieg co stary komponent `PsychologistProfileForm`
 * (`POMIAR-STAREGO-EKRANU.md`). Jedyny przycisk główny zależy od tego, co jest do zrobienia:
 * z niezapisanymi zmianami to „Zapisz zmiany”, po zapisie „Wyślij do sprawdzenia” (niedostępny
 * z powodem, dopóki czegoś brakuje). W stanach, w których wniosku nie da się zmienić ani wysłać,
 * przycisku głównego nie ma.
 */
export function ProfilPsychologa() {
  const router = useRouter();
  const idFormularza = useId();
  const dzialaRef = useRef(false);

  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [wniosek, setWniosek] = useState<Wniosek | null>(null);
  const [formularz, setFormularz] = useState<FormularzWniosku>(PUSTY_FORMULARZ);
  const [zgoda, setZgoda] = useState(false);
  const [typZalacznika, setTypZalacznika] = useState<ProfileDocumentType>("dyplom");
  const [plik, setPlik] = useState<File | null>(null);
  const [dzialanie, setDzialanie] = useState<Dzialanie | null>(null);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]>>({});
  const [blad, setBlad] = useState<BladAkcji | null>(null);
  const [bladZalacznika, setBladZalacznika] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const zastosuj = useCallback((dane: Wniosek) => {
    setWniosek(dane);
    setFormularz(formularzZWniosku(dane));
  }, []);

  const wczytaj = useCallback(
    (straz?: { anulowane: boolean }) =>
      pobierzWniosek().then(
        (dane) => {
          if (straz?.anulowane) return;
          zastosuj(dane);
          setStan("ok");
        },
        (wyjatek: unknown) => {
          if (straz?.anulowane) return;
          setStan(rodzajBledu(wyjatek));
        },
      ),
    [zastosuj],
  );

  const ponow = useCallback(() => {
    setStan("ladowanie");
    void wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  const rodzaj = wniosek ? rodzajStanu(wniosek) : "brak";
  const edytowalny = czyEdytowalny(rodzaj);
  const zmieniony = wniosek !== null && edytowalny && czyZmieniony(formularz, formularzZWniosku(wniosek));
  useZgloszenieNiezapisanychZmian(zmieniony, TYTUL_EKRANU);

  /** Jedno działanie naraz: drugie kliknięcie w trakcie pierwszego niczego nie wysyła. */
  async function uruchom(nazwa: Dzialanie, praca: () => Promise<void>) {
    if (dzialaRef.current) return;
    dzialaRef.current = true;
    setDzialanie(nazwa);
    setBlad(null);
    setToast(null);
    try {
      await praca();
    } finally {
      dzialaRef.current = false;
      setDzialanie(null);
    }
  }

  function zapisz() {
    return uruchom("zapis", async () => {
      setBledyPol({});
      try {
        zastosuj(await zapiszWniosek(formularz));
        setToast("Wniosek został zapisany.");
      } catch (wyjatek) {
        if (wyjatek instanceof ApiError && wyjatek.status === 422 && wyjatek.errors) {
          setBledyPol(wyjatek.errors);
          setBlad({ tytul: "Nie udało się zapisać wniosku", tresc: "Popraw zaznaczone pola." });
        } else {
          setBlad({
            tytul: "Nie udało się zapisać wniosku",
            tresc: komunikatBledu(wyjatek, "Nie udało się zapisać wniosku. Spróbuj ponownie."),
          });
        }
      }
    });
  }

  function dodaj() {
    if (plik === null) {
      setBladZalacznika("Wybierz plik przed dodaniem załącznika.");
      return Promise.resolve();
    }
    return uruchom("zalacznik", async () => {
      setBladZalacznika(null);
      try {
        // Odświeżona lista załączników nie nadpisuje tego, co wpisano w polach i jeszcze nie zapisano.
        setWniosek(await dodajZalacznik(typZalacznika, plik));
        setPlik(null);
      } catch (wyjatek) {
        const bledy = wyjatek instanceof ApiError && wyjatek.status === 422 ? wyjatek.errors : undefined;
        setBladZalacznika(
          bledy?.file?.[0] ?? bledy?.type?.[0] ?? komunikatBledu(wyjatek, "Nie udało się dodać załącznika. Spróbuj ponownie."),
        );
      }
    });
  }

  function wyslij() {
    return uruchom("wyslanie", async () => {
      try {
        zastosuj(await zlozWniosek(zgoda));
        setToast("Wniosek został wysłany do sprawdzenia.");
      } catch (wyjatek) {
        if (wyjatek instanceof ApiError && wyjatek.code === "profile_incomplete") {
          setBlad({
            tytul: "Wniosek jest niekompletny",
            tresc: `${wyjatek.message} ${zdanieOBrakach(wyjatek.reason?.missing ?? [])}`,
          });
        } else {
          setBlad({
            tytul: "Nie udało się wysłać wniosku",
            tresc: komunikatBledu(wyjatek, "Nie udało się złożyć wniosku. Spróbuj ponownie."),
          });
        }
      }
    });
  }

  function wycofaj() {
    return uruchom("wycofanie", async () => {
      try {
        zastosuj(await wycofajZgode());
        setToast("Zgoda na publikację została wycofana.");
      } catch (wyjatek) {
        setBlad({
          tytul: "Nie udało się wycofać zgody",
          tresc: komunikatBledu(wyjatek, "Nie udało się wycofać zgody. Spróbuj ponownie."),
        });
      }
    });
  }

  if (stan !== "ok" || wniosek === null) {
    return <EkranStanu stan={stan === "ok" ? "ladowanie" : stan} onPonow={ponow} />;
  }

  const wlasny = opisStanu(rodzaj);
  const braki = brakiWniosku(wniosek, zgoda);
  const bledyNazw = POLA_FORMULARZA.filter(({ klucz }) => bladPola(bledyPol, klucz) !== undefined);

  const przycisk = opisPrzyciskuGlownego({ edytowalny, zmieniony, dzialanie, braki });

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: TYTUL_EKRANU }]}
      tytul={TYTUL_EKRANU}
      opis="Przygotuj profil, który po zatwierdzeniu może trafić do bazy psychologów Fundacji, i wyślij go do sprawdzenia."
      onPowrot={() => router.back()}
      przyciskGlowny={
        wniosek.eligible && przycisk
          ? {
              etykieta: przycisk.etykieta,
              niedostepny: przycisk.powod ? { powod: przycisk.powod } : undefined,
              onKliknij: () => {
                if (przycisk.powod) document.getElementById(idFormularza)?.focus();
                else if (przycisk.akcja === "zapisz") void zapisz();
                else if (przycisk.akcja === "wyslij") void wyslij();
              },
            }
          : undefined
      }
    />
  );

  if (!wniosek.eligible) {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <Komunikat wariant="warn" tytul="Wniosek będzie dostępny po programie">
            Wniosek o wpis do bazy psychologów Fundacji będzie dostępny po ukończeniu całego programu.
          </Komunikat>
        }
      />
    );
  }

  const powiadomienie =
    blad || bledyNazw.length > 0 ? (
      <Komunikat wariant="error" tytul={blad?.tytul ?? "Popraw zaznaczone pola"}>
        {bledyNazw.length > 0 && blad?.tresc === "Popraw zaznaczone pola."
          ? `Popraw zaznaczone pola: ${bledyNazw.map(({ etykieta }) => etykieta).join(", ")}.`
          : (blad?.tresc ?? "")}
      </Komunikat>
    ) : undefined;

  const pola: Array<{ id: string; etykieta: string; pole: keyof FormularzWniosku; klucz: string; rodzaj: "tekst" | "wieloliniowy"; podpowiedz?: string }> = [
    {
      id: "profil-specjalizacje",
      etykieta: "Specjalizacje",
      pole: "specjalizacje",
      klucz: "specializations",
      rodzaj: "tekst",
      podpowiedz: "Oddziel przecinkami, np.: wsparcie w kryzysie, praca z młodymi dorosłymi. Potrzebne do wysłania wniosku.",
    },
    { id: "profil-nurt", etykieta: "Nurt terapeutyczny", pole: "nurt", klucz: "approach", rodzaj: "tekst", podpowiedz: "Potrzebny do wysłania wniosku." },
    { id: "profil-miasto", etykieta: "Miasto", pole: "miasto", klucz: "city", rodzaj: "tekst", podpowiedz: "Potrzebne do wysłania wniosku." },
    {
      id: "profil-opis",
      etykieta: "Opis",
      pole: "opis",
      klucz: "bio",
      rodzaj: "wieloliniowy",
      podpowiedz: "Kilka zdań o Tobie i Twojej pracy. Możesz zostawić puste.",
    },
  ];

  const zalaczniki = wniosek.documents;
  const mozeWycofac = czyMoznaWycofac(rodzaj);

  return (
    <FormTemplate
      naglowek={naglowek}
      powiadomienie={powiadomienie}
      tresc={
        <div className={style.stos}>
          <section className={style.blokStanu} aria-labelledby="profil-stan-naglowek">
            <Heading stopien={2} id="profil-stan-naglowek">
              Stan wniosku
            </Heading>
            <div className={style.stanWiersz}>
              <Badge wariant={wlasny.wariant}>{wlasny.nazwa}</Badge>
              <Text>{wlasny.znaczy}</Text>
            </div>
            {rodzaj === "returned" && wniosek.return_reason && (
              <Komunikat wariant="warn" stopien={3} tytul="Uwagi do wniosku">
                {wniosek.return_reason}
              </Komunikat>
            )}
            <Text>Co dalej: {wlasny.dalej}</Text>
          </section>

          <form
            id={idFormularza}
            tabIndex={-1}
            className={`${style.karta} ${style.celFokusu}`}
            aria-label="Dane wniosku"
            noValidate
            onSubmit={(zdarzenie) => {
              zdarzenie.preventDefault();
              if (edytowalny) void zapisz();
            }}
          >
            <Heading stopien={2}>Dane wniosku</Heading>
            <div className={style.pola}>
              {pola.map((definicja) => (
                <Field
                  key={definicja.id}
                  id={definicja.id}
                  etykieta={definicja.etykieta}
                  rodzaj={definicja.rodzaj}
                  wartosc={formularz[definicja.pole]}
                  onZmiana={(wartosc) => {
                    setFormularz((poprzedni) => ({ ...poprzedni, [definicja.pole]: wartosc }));
                    setToast(null);
                  }}
                  zablokowany={!edytowalny}
                  podpowiedz={edytowalny ? definicja.podpowiedz : undefined}
                  blad={bladPola(bledyPol, definicja.klucz)}
                />
              ))}
            </div>
          </form>

          <section className={style.karta} aria-labelledby="profil-zalaczniki-naglowek">
            <Heading stopien={2} id="profil-zalaczniki-naglowek">
              Załączniki weryfikacyjne
            </Heading>
            <Text>{zdanieOZalacznikach(zalaczniki.length)}</Text>
            {zalaczniki.length > 0 && (
              <ul className={style.wiersze}>
                {zalaczniki.map((dokument) => (
                  <li key={dokument.id}>
                    <Text>{opisZalacznika(dokument)}</Text>
                  </li>
                ))}
              </ul>
            )}
            {edytowalny && (
              <div className={style.pola}>
                <Field
                  id="profil-typ-zalacznika"
                  etykieta="Typ załącznika"
                  rodzaj="wybor"
                  wartosc={typZalacznika}
                  opcje={TYPY_ZALACZNIKOW.map((typ) => ({ wartosc: typ, etykieta: ETYKIETY_ZALACZNIKOW[typ] }))}
                  onZmiana={(wartosc) => setTypZalacznika(wartosc as ProfileDocumentType)}
                />
                <FileDropZone
                  id="profil-plik"
                  etykieta="Przeciągnij plik tutaj albo wybierz go z dysku."
                  podpowiedz="Dozwolone formaty: PDF, JPG, PNG. Plik może mieć najwyżej 10 MB."
                  wiele={false}
                  akceptuj=".pdf,.jpg,.jpeg,.png"
                  pliki={plik ? [{ nazwa: plik.name, stan: "gotowy", komunikat: "Gotowy do dodania" }] : []}
                  onWybierzPliki={(pliki) => {
                    setPlik(pliki[0] ?? null);
                    setBladZalacznika(null);
                  }}
                />
                <ErrorText id="profil-plik-blad">{bladZalacznika ?? undefined}</ErrorText>
                <div className={style.akcje}>
                  <Button poziom="outline" onClick={() => void dodaj()}>
                    {dzialanie === "zalacznik" ? "Dodawanie…" : "Dodaj załącznik"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {(edytowalny || mozeWycofac) && (
            <section className={style.karta} aria-labelledby="profil-zgoda-naglowek">
              <Heading stopien={2} id="profil-zgoda-naglowek">
                Zgoda na publikację
              </Heading>
              {edytowalny && (
                <Checkbox
                  id="profil-zgoda"
                  zaznaczony={zgoda}
                  onZmiana={setZgoda}
                  etykieta="Wyrażam zgodę na publikację mojego profilu w bazie psychologów Fundacji."
                />
              )}
              {mozeWycofac && (
                <>
                  <Text>
                    Możesz w każdej chwili wycofać zgodę na publikację profilu. Wniosek przejdzie wtedy w stan „zgoda
                    wycofana” i nie będzie już edytowalny.
                  </Text>
                  <div className={style.akcje}>
                    <Button poziom="outline" onClick={() => void wycofaj()}>
                      {dzialanie === "wycofanie" ? "Wycofywanie…" : "Wycofaj zgodę"}
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
          {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        </div>
      }
    />
  );
}

/**
 * Jedyny zielony przycisk ekranu albo `null`, gdy w danym stanie nie ma czego wysłać ani zapisać.
 * Z niezapisanymi zmianami zawsze „Zapisz zmiany”; bez nich „Wyślij do sprawdzenia”, niedostępny
 * z powodem (`powod`), dopóki zapisanemu wnioskowi czegoś brakuje. W trakcie działania napis się zmienia.
 */
function opisPrzyciskuGlownego({
  edytowalny,
  zmieniony,
  dzialanie,
  braki,
}: {
  edytowalny: boolean;
  zmieniony: boolean;
  dzialanie: Dzialanie | null;
  braki: string[];
}): { etykieta: string; akcja: "zapisz" | "wyslij"; powod?: string } | null {
  if (!edytowalny) return null;
  if (zmieniony) return { etykieta: dzialanie === "zapis" ? "Zapisywanie…" : "Zapisz zmiany", akcja: "zapisz" };
  return {
    etykieta: dzialanie === "wyslanie" ? "Wysyłanie…" : "Wyślij do sprawdzenia",
    akcja: "wyslij",
    powod: braki.length > 0 ? `${zdanieOBrakach(braki)} Uzupełnij je, żeby wysłać wniosek.` : undefined,
  };
}
