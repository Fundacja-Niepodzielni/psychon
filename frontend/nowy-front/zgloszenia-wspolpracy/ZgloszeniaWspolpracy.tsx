"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import {
  odpowiedzNaZgloszenie,
  pobierzZgloszeniaAdministracji,
  type AdminCooperationRequest,
} from "@/lib/api/h01-wspolpraca";
import { formatujDateICzas } from "../wspolne/daty";
import {
  LICZBA_ZNAKOW_MAX,
  OPCJE_FILTRA,
  OPCJE_STATUSU_PO_ODPOWIEDZI,
  PLAKIETKA_STATUSU,
  czyBrakUprawnien,
  czyPasujeDoFiltra,
  moznaOdpowiedziec,
  nazwaOsoby,
  sklasyfikujBladOdpowiedzi,
  type FiltrStatusu,
} from "./dane";
import style from "./ZgloszeniaWspolpracy.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "gotowy"; zgloszenia: AdminCooperationRequest[]; meta: PaginationMeta | undefined };

interface OtwartaOdpowiedz {
  id: number;
  response: string;
  status: "answered" | "closed";
  bledy: Record<string, string[]> | undefined;
}

/**
 * Ekran zgłoszeń dalszej współpracy (administracja) na szablonie
 * `ListTemplate`: nagłówek, filtr statusu, lista zgłoszeń i stronicowanie.
 * Każdy stan — ładowanie, dane, pusty, brak uprawnień, błąd sieci — stoi
 * w obszarach szablonu, więc jedyny `main` jest korzeniem szablonu.
 *
 * Trasy: `GET /admin/cooperation-requests` i
 * `PATCH /admin/cooperation-requests/{id}` (`backend/routes/api/h01.php:45-46`).
 *
 * Wiersz to atomy (`Badge`/`Text`/`Hint`), nie `RecordList`: zgłoszenie
 * zamknięte nie ma żadnego przycisku, a organizm wymaga akcji w każdym
 * wierszu. „Odpowiedz na prośbę” otwiera pod wierszem `FormSection`
 * z odpowiedzią i statusem po odpowiedzi — bez okna dialogowego. Przycisk
 * „Odpowiedz” w tej sekcji jest jedynym przyciskiem głównym ekranu.
 * Zgłoszenia z odpowiedzią (`answered`, `closed`) pokazują jej treść i datę.
 */
export function ZgloszeniaWspolpracy() {
  const router = useRouter();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [filtr, setFiltr] = useState<FiltrStatusu>("");
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);
  const [otwarta, setOtwarta] = useState<OtwartaOdpowiedz | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wczytanoRaz, setWczytanoRaz] = useState(false);
  useZgloszenieNiezapisanychZmian(
    otwarta !== null && (otwarta.response.trim() !== "" || otwarta.status !== "answered"),
    "Dalsza współpraca",
  );

  useEffect(() => {
    let aktualne = true;
    pobierzZgloszeniaAdministracji({
      status: filtr === "" ? undefined : filtr,
      page: strona,
    })
      .then(({ data, meta }) => {
        if (!aktualne) return;
        setWczytanoRaz(true);
        setStan({ rodzaj: "gotowy", zgloszenia: data, meta });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [filtr, strona, proba]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function odswiez() {
    setProba((p) => p + 1);
  }

  function naZmianeFiltra(wartosc: string) {
    setOtwarta(null);
    setKomunikat(null);
    setStan({ rodzaj: "ladowanie" });
    setStrona(1);
    setFiltr(wartosc as FiltrStatusu);
  }

  function zmienStrone(nowa: number) {
    setOtwarta(null);
    setKomunikat(null);
    setStan({ rodzaj: "ladowanie" });
    setStrona(nowa);
  }

  function otworz(zgloszenie: AdminCooperationRequest) {
    setKomunikat(null);
    setOtwarta({ id: zgloszenie.id, response: "", status: "answered", bledy: undefined });
  }

  async function zapisz(otwartaOdpowiedz: OtwartaOdpowiedz) {
    if (zapisywanie) return;
    setZapisywanie(true);
    setKomunikat(null);
    setOtwarta((biezaca) => (biezaca ? { ...biezaca, bledy: undefined } : biezaca));
    try {
      const zaktualizowany = await odpowiedzNaZgloszenie(otwartaOdpowiedz.id, {
        response: otwartaOdpowiedz.response.trim(),
        status: otwartaOdpowiedz.status,
      });
      setStan((poprzedni) => {
        if (poprzedni.rodzaj !== "gotowy") return poprzedni;
        const zgloszenia = poprzedni.zgloszenia
          .map((zgloszenie) => (zgloszenie.id === zaktualizowany.id ? zaktualizowany : zgloszenie))
          .filter((zgloszenie) => czyPasujeDoFiltra(zgloszenie, filtr));
        const usuniete = poprzedni.zgloszenia.length - zgloszenia.length;
        const meta = poprzedni.meta && { ...poprzedni.meta, total: Math.max(poprzedni.meta.total - usuniete, 0) };
        return { rodzaj: "gotowy", zgloszenia, meta };
      });
      setOtwarta(null);
      setToast(
        zaktualizowany.status === "closed"
          ? `Prośba zamknięta: ${nazwaOsoby(zaktualizowany)}.`
          : `Odpowiedź zapisana: ${nazwaOsoby(zaktualizowany)}.`,
      );
    } catch (blad: unknown) {
      const opis = sklasyfikujBladOdpowiedzi(blad);
      if (opis.rodzaj === "pola") {
        setOtwarta((biezaca) => (biezaca ? { ...biezaca, bledy: opis.bledy } : biezaca));
      } else if (opis.rodzaj === "zamkniete" || opis.rodzaj === "brak-zgloszenia") {
        setOtwarta(null);
        setKomunikat(opis.komunikat);
        odswiez();
      } else {
        setKomunikat(opis.komunikat);
      }
    } finally {
      setZapisywanie(false);
    }
  }

  const naglowek = (
    <header className={style.naglowekEkranu}>
      <Heading stopien={1}>Dalsza współpraca</Heading>
      <Text>Prośby uczestników po zakończeniu programu. Odpowiedz na prośbę albo ją zamknij.</Text>
    </header>
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Dalsza współpraca"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const filtry = wczytanoRaz ? (
    <div className={style.filtr}>
      <Field
        id="zgloszenia-filtr-status"
        etykieta="Stan"
        rodzaj="wybor"
        opcje={OPCJE_FILTRA}
        wartosc={filtr}
        onZmiana={naZmianeFiltra}
      />
    </div>
  ) : undefined;

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek} filtry={filtry} lista={<Skeleton wiersze={4} />} />;
  }

  if (stan.rodzaj === "blad") {
    return (
      <ListTemplate
        naglowek={naglowek}
        filtry={filtry}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać próśb"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer jest nieosiągalny albo zwrócił błąd. Żadne dane nie zostały zmienione.
          </Notice>
        }
      />
    );
  }

  const { zgloszenia, meta } = stan;

  const lista =
    zgloszenia.length === 0 ? (
      <>
        {komunikat && <KomunikatBledu tresc={komunikat} />}
        {filtr === "" ? (
          <EmptyState
            naglowek="Brak próśb o współpracę"
            tresc="Prośby pojawią się tutaj, gdy uczestnicy wyślą je po zakończeniu programu."
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        ) : (
          <EmptyState
            wariant="brak-wynikow-filtra"
            naglowek="Brak próśb o współpracę"
            tresc="Żadna prośba nie ma wybranego statusu."
            przycisk={{ etykieta: "Pokaż wszystkie", onClick: () => naZmianeFiltra("") }}
          />
        )}
      </>
    ) : (
      <>
        {komunikat && <KomunikatBledu tresc={komunikat} />}
        <ul className={style.lista} aria-label="Dalsza współpraca">
          {zgloszenia.map((zgloszenie) => (
            <li key={zgloszenie.id} className={style.wiersz}>
              <div className={style.naglowekWiersza}>
                <Text>{nazwaOsoby(zgloszenie)}</Text>
                <Badge wariant={PLAKIETKA_STATUSU[zgloszenie.status].wariant}>
                  {PLAKIETKA_STATUSU[zgloszenie.status].tekst}
                </Badge>
              </div>
              <Hint>
                {`${zgloszenie.user?.email ?? "brak e-maila"} — złożono ${formatujDateICzas(zgloszenie.created_at)}`}
              </Hint>
              <div className={style.tresc}>
                <Text>{zgloszenie.body}</Text>
              </div>
              {zgloszenie.status !== "new" && zgloszenie.response !== null && zgloszenie.response.trim() !== "" && (
                <div className={style.odpowiedz} data-testid={`odpowiedz-${zgloszenie.id}`}>
                  <Hint>{`Odpowiedź z ${formatujDateICzas(zgloszenie.responded_at)}`}</Hint>
                  <div className={style.tresc}>
                    <Text>{zgloszenie.response}</Text>
                  </div>
                </div>
              )}
              {moznaOdpowiedziec(zgloszenie) && (
                <div className={style.akcje}>
                  <Button poziom="outline" disabled={zapisywanie} onClick={() => otworz(zgloszenie)}>
                    Odpowiedz na prośbę
                  </Button>
                </div>
              )}
              {otwarta?.id === zgloszenie.id && (
                <div className={style.formularz}>
                  <FormSection
                    fokusPrzyOtwarciu
                    tytul={`Odpowiedź na prośbę: ${nazwaOsoby(zgloszenie)}`}
                    pola={[
                      {
                        id: `odpowiedz-tresc-${zgloszenie.id}`,
                        etykieta: "Odpowiedź",
                        rodzaj: "wieloliniowy",
                        wartosc: otwarta.response,
                        onZmiana: (wartosc) =>
                          setOtwarta((biezaca) =>
                            biezaca ? { ...biezaca, response: wartosc.slice(0, LICZBA_ZNAKOW_MAX) } : biezaca,
                          ),
                        blad: otwarta.bledy?.response?.[0],
                        podpowiedz: `${otwarta.response.length}/${LICZBA_ZNAKOW_MAX} znaków`,
                        wymagane: true,
                      },
                      {
                        id: `odpowiedz-status-${zgloszenie.id}`,
                        etykieta: "Stan po odpowiedzi",
                        rodzaj: "wybor",
                        opcje: OPCJE_STATUSU_PO_ODPOWIEDZI,
                        wartosc: otwarta.status,
                        onZmiana: (wartosc) =>
                          setOtwarta((biezaca) =>
                            biezaca ? { ...biezaca, status: wartosc as "answered" | "closed" } : biezaca,
                          ),
                        blad: otwarta.bledy?.status?.[0],
                        wymagane: true,
                      },
                    ]}
                    etykietaAnuluj="Wróć do listy"
                    etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Odpowiedz"}
                    onAnuluj={() => setOtwarta(null)}
                    onZapisz={() => void zapisz(otwarta)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <>
      <ListTemplate
        naglowek={naglowek}
        filtry={filtry}
        lista={lista}
        stronicowanie={
          meta && meta.last_page > 1 ? (
            <Pagination
              strona={meta.current_page}
              stron={meta.last_page}
              naPoprzednia={() => zmienStrone(meta.current_page - 1)}
              naNastepna={() => zmienStrone(meta.current_page + 1)}
            />
          ) : undefined
        }
      />
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </>
  );
}

function KomunikatBledu({ tresc }: { tresc: string }) {
  return (
    <Notice wariant="error" tytul="Nie udało się zapisać odpowiedzi">
      {tresc}
    </Notice>
  );
}
