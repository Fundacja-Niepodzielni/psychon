"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { ApiError } from "@/lib/api/klient";
import { EkranStanu, type StanBezDanych } from "../grupa-prowadzacego/EkranStanu";
import { useFokusNaNaglowku } from "../grupa-prowadzacego/fokus";
import { Komunikat } from "../grupa-prowadzacego/Komunikat";
import style from "../grupa-prowadzacego/GrupaProwadzacego.module.css";
import { rodzajBledu } from "../pulpit/rodzaj-bledu";
import {
  LIMIT_WIADOMOSCI,
  dodajOsobe,
  pobierzWatki,
  pobierzWiadomosci,
  usunOsobe,
  wyslijWiadomosc,
  zalozWatek,
  type ChatMessage,
  type ChatThread,
  type PaginationMeta,
} from "./dane";
import {
  POWOD_BRAKU_NUMERU,
  POWOD_PUSTEJ_WIADOMOSCI,
  licznikZnakow,
  metaPoDopisaniu,
  numerOsoby,
  planPoWyslaniu,
  podpisWiadomosci,
  wierszeWatkow,
  zdanieOStronie,
} from "./logika";

const TYTUL = "Wątek grupowy";
const OPIS = "Rozmowa z całą grupą: wiadomości do wszystkich osób, które masz w grupie.";

type StanEkranu = StanBezDanych | "ok";

type StanWiadomosci =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "zakazane" }
  | { rodzaj: "blad"; komunikat: string }
  | { rodzaj: "ok"; wiadomosci: ChatMessage[]; meta: PaginationMeta | undefined; strona: number };

const komunikat = (blad: unknown, zastepczy: string) => (blad instanceof ApiError ? blad.message : zastepczy);

/**
 * Ekran „Wątek grupowy” (prowadzący) na szablonie listy: lista wątków (w praktyce jeden), po otwarciu —
 * wiadomości w kolejności czasu z autorem i datą, pole wysyłki i skład wątku.
 *
 * Te same żądania i ten sam przebieg co stary komponent `InstructorGroupThread`
 * (`grupa-prowadzacego/POMIAR-STAREGO-EKRANU.md`). Jedyny przycisk główny zależy od stanu: bez wątku to
 * „Załóż wątek grupowy” w nagłówku, w otwartym wątku „Wyślij wiadomość” (niedostępny z powodem, dopóki pole
 * jest puste). Po otwarciu wątku fokus idzie na nagłówek „Wiadomości”. Serwer nie ma pojęcia wątku
 * zamkniętego ani usuwania wiadomości, więc ekran ich nie pokazuje; usunięcie osoby ze składu, tak jak
 * dotąd, odbywa się bez pytania o potwierdzenie.
 */
export function WatekGrupowy() {
  const router = useRouter();
  const dziala = useRef(false);

  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [komunikatListy, setKomunikatListy] = useState<string | undefined>(undefined);
  const [watki, setWatki] = useState<ChatThread[]>([]);
  const [zaklada, setZaklada] = useState(false);
  const [bladZakladania, setBladZakladania] = useState<string | null>(null);

  /** Który wątek i która jego strona ma być wczytana; `proba` rośnie, żeby to samo wczytać jeszcze raz. */
  const [zadanie, setZadanie] = useState<{ id: number; strona: number; proba: number } | null>(null);
  const wybrany = zadanie?.id ?? null;
  const [wiadomosci, setWiadomosci] = useState<StanWiadomosci>({ rodzaj: "ladowanie" });
  const [szkic, setSzkic] = useState("");
  const [wysyla, setWysyla] = useState(false);
  const [bladWysylki, setBladWysylki] = useState<string | null>(null);

  const [numer, setNumer] = useState("");
  const [dzialanieSkladu, setDzialanieSkladu] = useState<"dodawanie" | "usuwanie" | null>(null);
  const [bladSkladu, setBladSkladu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Wpisana, a niewysłana wiadomość to praca, którą wyjście z ekranu by utraciło.
  useZgloszenieNiezapisanychZmian(szkic.trim() !== "", TYTUL);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    return pobierzWatki().then(
      (dane) => {
        if (straz?.anulowane) return;
        setWatki(dane);
        setStan("ok");
      },
      (wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setKomunikatListy(wyjatek instanceof ApiError ? wyjatek.message : undefined);
        setStan(rodzajBledu(wyjatek));
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
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  useEffect(() => {
    if (zadanie === null) return;
    let aktualne = true;
    pobierzWiadomosci(zadanie.id, zadanie.strona).then(
      ({ data, meta }) => {
        if (aktualne) setWiadomosci({ rodzaj: "ok", wiadomosci: data, meta, strona: zadanie.strona });
      },
      (wyjatek: unknown) => {
        if (!aktualne) return;
        setWiadomosci(
          wyjatek instanceof ApiError && wyjatek.status === 403
            ? { rodzaj: "zakazane" }
            : { rodzaj: "blad", komunikat: komunikat(wyjatek, "Nie udało się wczytać wiadomości. Spróbuj ponownie.") },
        );
      },
    );
    return () => {
      aktualne = false;
    };
  }, [zadanie]);

  /** Otwiera wątek (albo jego inną stronę); spóźniona odpowiedź na starsze żądanie jest ignorowana. */
  function otworz(idWatku: number, strona = 1) {
    setWiadomosci({ rodzaj: "ladowanie" });
    setBladWysylki(null);
    setBladSkladu(null);
    setZadanie((poprzednie) => ({ id: idWatku, strona, proba: (poprzednie?.proba ?? 0) + 1 }));
  }

  async function uruchom(praca: () => Promise<void>) {
    if (dziala.current) return;
    dziala.current = true;
    try {
      await praca();
    } finally {
      dziala.current = false;
    }
  }

  function zaloz() {
    return uruchom(async () => {
      setZaklada(true);
      setBladZakladania(null);
      try {
        await zalozWatek();
        setStan("ladowanie");
        await wczytaj();
      } catch (wyjatek) {
        setBladZakladania(komunikat(wyjatek, "Nie udało się założyć wątku grupowego. Spróbuj ponownie."));
      } finally {
        setZaklada(false);
      }
    });
  }

  function wyslij() {
    if (wybrany === null || wiadomosci.rodzaj !== "ok") return Promise.resolve();
    const idWatku = wybrany;
    const biezace = wiadomosci;
    return uruchom(async () => {
      setWysyla(true);
      setBladWysylki(null);
      setToast(null);
      try {
        const wyslana = await wyslijWiadomosc(idWatku, szkic);
        setSzkic("");
        const plan = planPoWyslaniu(biezace.meta, biezace.wiadomosci.length);
        if (plan.rodzaj === "dopisz") {
          setWiadomosci({ ...biezace, wiadomosci: [...biezace.wiadomosci, wyslana], meta: metaPoDopisaniu(biezace.meta) });
        } else {
          otworz(idWatku, plan.strona);
        }
        setToast("Wiadomość została wysłana.");
      } catch (wyjatek) {
        setBladWysylki(komunikat(wyjatek, "Nie udało się wysłać wiadomości. Spróbuj ponownie."));
      } finally {
        setWysyla(false);
      }
    });
  }

  function zmienSklad(rodzaj: "dodawanie" | "usuwanie") {
    const idOsoby = numerOsoby(numer);
    if (wybrany === null || idOsoby === null) return Promise.resolve();
    const idWatku = wybrany;
    return uruchom(async () => {
      setDzialanieSkladu(rodzaj);
      setBladSkladu(null);
      setToast(null);
      try {
        if (rodzaj === "dodawanie") await dodajOsobe(idWatku, idOsoby);
        else await usunOsobe(idWatku, idOsoby);
        setNumer("");
        setToast(rodzaj === "dodawanie" ? "Osoba dodana do składu wątku." : "Osoba usunięta ze składu wątku.");
      } catch (wyjatek) {
        setBladSkladu(
          komunikat(
            wyjatek,
            rodzaj === "dodawanie" ? "Nie udało się dodać osoby do wątku. Spróbuj ponownie." : "Nie udało się usunąć osoby z wątku. Spróbuj ponownie.",
          ),
        );
      } finally {
        setDzialanieSkladu(null);
      }
    });
  }

  if (stan !== "ok") {
    return (
      <EkranStanu
        stan={stan}
        tytul={TYTUL}
        opis={OPIS}
        czego="wątku grupowego"
        tytulBledu="Nie udało się wczytać wątku grupowego"
        czegoNieZnaleziono="wątku grupowego"
        komunikat={komunikatListy}
        onPonow={ponow}
      />
    );
  }

  const brakWatku = watki.length === 0;

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: "Prowadzący" }, { etykieta: TYTUL }]}
      tytul={TYTUL}
      opis={OPIS}
      onPowrot={() => router.back()}
      przyciskGlowny={brakWatku ? { etykieta: zaklada ? "Zakładanie…" : "Załóż wątek grupowy", onKliknij: () => void zaloz() } : undefined}
    />
  );

  return (
    <ListTemplate
      naglowek={naglowek}
      lista={
        <div className={style.stos}>
          {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}

          {brakWatku ? (
            <section className={style.sekcja} aria-labelledby="watek-brak-naglowek">
              <Heading stopien={2} id="watek-brak-naglowek">
                Nie masz jeszcze wątku grupowego
              </Heading>
              <Text wariant="pusty">Załóż go przyciskiem „Załóż wątek grupowy” u góry strony, żeby pisać do całej grupy.</Text>
              {bladZakladania !== null && (
                <Komunikat wariant="error" stopien={3} tytul="Nie udało się założyć wątku">
                  {bladZakladania}
                </Komunikat>
              )}
            </section>
          ) : (
            <RecordList
              tytul="Wątki grupowe"
              stopienNaglowka={2}
              wiersze={wierszeWatkow(watki, (id) => otworz(id))}
              pusty={{ naglowek: "Brak wątków", tresc: "Nie masz jeszcze wątku grupowego.", przycisk: { etykieta: "Odśwież", onClick: ponow } }}
            />
          )}

          {wybrany !== null && (
            <PanelWiadomosci key={wybrany} stan={wiadomosci} onPonow={() => otworz(wybrany)} onStrona={(strona) => otworz(wybrany, strona)}>
              {wiadomosci.rodzaj === "ok" && (
                <FormularzWysylki
                  szkic={szkic}
                  onZmiana={setSzkic}
                  wysyla={wysyla}
                  blad={bladWysylki}
                  onWyslij={() => void wyslij()}
                />
              )}
            </PanelWiadomosci>
          )}

          {wybrany !== null && wiadomosci.rodzaj === "ok" && (
            <SkladWatku
              numer={numer}
              onZmiana={setNumer}
              dzialanie={dzialanieSkladu}
              blad={bladSkladu}
              onDodaj={() => void zmienSklad("dodawanie")}
              onUsun={() => void zmienSklad("usuwanie")}
            />
          )}
        </div>
      }
    />
  );
}

function PanelWiadomosci({
  stan,
  onPonow,
  onStrona,
  children,
}: {
  stan: StanWiadomosci;
  onPonow: () => void;
  onStrona: (strona: number) => void;
  children: ReactNode;
}) {
  const idNaglowka = useId();
  useFokusNaNaglowku(idNaglowka);

  let tresc: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    tresc = (
      <>
        <p role="status" className={style.stanPusty}>
          Wczytywanie wiadomości…
        </p>
        <Skeleton wiersze={3} />
      </>
    );
  } else if (stan.rodzaj === "zakazane") {
    tresc = (
      <Komunikat wariant="error" stopien={3} tytul="Brak dostępu do wątku">
        Nie masz uprawnień do wyświetlenia tego wątku.
      </Komunikat>
    );
  } else if (stan.rodzaj === "blad") {
    tresc = (
      <Komunikat
        wariant="error"
        stopien={3}
        tytul="Nie udało się wczytać wiadomości"
        akcja={
          <Button poziom="outline" onClick={onPonow}>
            Spróbuj ponownie
          </Button>
        }
      >
        {stan.komunikat}
      </Komunikat>
    );
  } else {
    tresc = (
      <>
        {stan.wiadomosci.length === 0 ? (
          <Text wariant="pusty">Nie ma jeszcze żadnych wiadomości w tym wątku.</Text>
        ) : (
          <ul className={style.wiersze}>
            {stan.wiadomosci.map((wiadomosc) => (
              <li key={wiadomosc.id} className={style.wiadomosc}>
                <Hint>{podpisWiadomosci(wiadomosc)}</Hint>
                {/* Treść jako tekst — nigdy wstrzykiwany HTML. */}
                <div className={style.trescWiadomosci}>
                  <Text>{wiadomosc.body.trim() === "" ? "(pusta wiadomość)" : wiadomosc.body}</Text>
                </div>
              </li>
            ))}
          </ul>
        )}
        {stan.meta !== undefined && stan.meta.last_page > 1 && (
          <>
            <Hint>{zdanieOStronie(stan.meta, stan.wiadomosci.length)}</Hint>
            <Pagination
              strona={stan.meta.current_page}
              stron={stan.meta.last_page}
              naPoprzednia={() => onStrona(stan.strona - 1)}
              naNastepna={() => onStrona(stan.strona + 1)}
            />
          </>
        )}
        {children}
      </>
    );
  }

  return (
    <section className={style.karta} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Wiadomości
      </Heading>
      {tresc}
    </section>
  );
}

function FormularzWysylki({
  szkic,
  onZmiana,
  wysyla,
  blad,
  onWyslij,
}: {
  szkic: string;
  onZmiana: (wartosc: string) => void;
  wysyla: boolean;
  blad: string | null;
  onWyslij: () => void;
}) {
  const idPowodu = useId();
  const pusty = szkic.trim() === "";
  return (
    <form
      className={style.pola}
      aria-label="Nowa wiadomość"
      noValidate
      onSubmit={(zdarzenie) => {
        zdarzenie.preventDefault();
        if (!pusty && !wysyla) onWyslij();
      }}
    >
      <Field
        id="watek-wiadomosc"
        etykieta="Wiadomość do grupy"
        rodzaj="wieloliniowy"
        wymagane
        wartosc={szkic}
        onZmiana={(wartosc) => onZmiana(wartosc.slice(0, LIMIT_WIADOMOSCI))}
        podpowiedz={licznikZnakow(szkic, LIMIT_WIADOMOSCI)}
        blad={undefined}
      />
      {blad !== null && (
        <Komunikat wariant="error" stopien={3} tytul="Nie udało się wysłać wiadomości">
          {blad}
        </Komunikat>
      )}
      <div className={style.akcje}>
        <Button poziom="primary" type="submit" aria-disabled={pusty ? true : undefined} aria-describedby={pusty ? idPowodu : undefined}>
          {wysyla ? "Wysyłanie…" : "Wyślij wiadomość"}
        </Button>
      </div>
      {pusty && <Hint id={idPowodu}>{POWOD_PUSTEJ_WIADOMOSCI}</Hint>}
    </form>
  );
}

function SkladWatku({
  numer,
  onZmiana,
  dzialanie,
  blad,
  onDodaj,
  onUsun,
}: {
  numer: string;
  onZmiana: (wartosc: string) => void;
  dzialanie: "dodawanie" | "usuwanie" | null;
  blad: string | null;
  onDodaj: () => void;
  onUsun: () => void;
}) {
  const idNaglowka = useId();
  const idPowodu = useId();
  const niepoprawny = numerOsoby(numer) === null;
  return (
    <section className={style.karta} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Skład wątku
      </Heading>
      <Text>Dodanie przypisuje osobę do Twojej grupy, a usunięcie zdejmuje ją z grupy.</Text>
      <Field
        id="watek-numer-osoby"
        etykieta="Numer osoby"
        rodzaj="liczba"
        wartosc={numer}
        onZmiana={onZmiana}
        podpowiedz="Liczba całkowita większa od zera."
      />
      {blad !== null && (
        <Komunikat wariant="error" stopien={3} tytul="Nie udało się zmienić składu">
          {blad}
        </Komunikat>
      )}
      <div className={style.akcje}>
        <Button poziom="outline" disabled={niepoprawny || dzialanie !== null} aria-describedby={niepoprawny ? idPowodu : undefined} onClick={onDodaj}>
          {dzialanie === "dodawanie" ? "Dodawanie…" : "Dodaj do wątku"}
        </Button>
        <Button poziom="outline" disabled={niepoprawny || dzialanie !== null} aria-describedby={niepoprawny ? idPowodu : undefined} onClick={onUsun}>
          {dzialanie === "usuwanie" ? "Usuwanie…" : "Usuń z wątku"}
        </Button>
      </div>
      {niepoprawny && <Hint id={idPowodu}>{POWOD_BRAKU_NUMERU}</Hint>}
    </section>
  );
}
