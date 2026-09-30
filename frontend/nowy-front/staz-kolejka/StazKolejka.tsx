"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import {
  czyBrakUprawnien,
  dataPolska,
  etykietaFormy,
  nazwaOsoby,
  pobierzWpisyDoDecyzji,
  sklasyfikujBladDecyzji,
  zapiszDecyzje,
  type RodzajDecyzji,
  type WpisDoDecyzji,
} from "./dane";
import style from "./StazKolejka.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "gotowy"; wpisy: WpisDoDecyzji[]; meta: PaginationMeta | undefined };

interface OtwartaDecyzja {
  id: number;
  rodzaj: Exclude<RodzajDecyzji, "zatwierdz">;
  komentarz: string;
  blad: string | undefined;
}

interface KomunikatBledu {
  tytul: string;
  tresc: string;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Dyżury do decyzji" }];

const TEKSTY_DECYZJI: Record<
  Exclude<RodzajDecyzji, "zatwierdz">,
  { tytul: string; etykieta: string; pole: string; toast: string }
> = {
  odeslij: {
    tytul: "Poproś o poprawkę",
    etykieta: "Poproś o poprawkę",
    pole: "Co trzeba poprawić",
    toast: "Dyżur odesłany do poprawy.",
  },
  odrzuc: {
    tytul: "Odrzuć dyżur",
    etykieta: "Odrzuć dyżur",
    pole: "Powód odrzucenia",
    toast: "Dyżur odrzucony.",
  },
};

/**
 * Ekran decyzji o dyżurach na szablonie `ListTemplate`: nagłówek, lista
 * dyżurów czekających na decyzję (serwer podaje kolejność: od najstarszego
 * zgłoszenia) i stronicowanie. Każdy stan — ładowanie, dane, pusty, brak
 * uprawnień, błąd sieci — stoi w obszarach szablonu, więc jedyny `main`
 * jest zawsze korzeniem szablonu.
 *
 * Wiersz to atomy (`Badge`/`Text`/`Hint`) i jeden rząd trzech przycisków:
 * „Zatwierdź” (bez ciała), „Poproś o poprawkę” i „Odrzuć dyżur”. Dwie
 * ostatnie otwierają `FormSection` z wymaganym komentarzem w treści, pod
 * wierszem — bez okna dialogowego. `RecordList` niesie dokładnie jedną akcję
 * na wiersz i nie pomieści formularza pod wierszem, dlatego wiersz jest
 * złożony tu, z tych samych atomów co `ListRow`.
 *
 * Po decyzji wiersz znika z listy, a `Toast` potwierdza wynik. Dyżur już
 * rozstrzygnięty przez kogoś innego (403 `entry_locked`) pokazuje
 * komunikat z koperty i odświeża listę.
 */
export function StazKolejka() {
  const router = useRouter();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);
  const [otwarta, setOtwarta] = useState<OtwartaDecyzja | null>(null);
  const [zajete, setZajete] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<KomunikatBledu | null>(null);

  useEffect(() => {
    let aktualne = true;
    pobierzWpisyDoDecyzji(strona)
      .then(({ wpisy, meta }) => {
        if (!aktualne) return;
        // Strona poza końcem (po decyzjach na ostatniej stronie) — cofnięcie o jedną.
        if (wpisy.length === 0 && strona > 1) {
          setStrona(strona - 1);
          return;
        }
        setStan({ rodzaj: "gotowy", wpisy, meta });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [strona, proba]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function odswiez() {
    setProba((p) => p + 1);
  }

  function zmienStrone(nowa: number) {
    setOtwarta(null);
    setStan({ rodzaj: "ladowanie" });
    setStrona(nowa);
  }

  function usunZListy(id: number) {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy") return poprzedni;
      const wpisy = poprzedni.wpisy.filter((wpis) => wpis.id !== id);
      const meta = poprzedni.meta && { ...poprzedni.meta, total: Math.max(poprzedni.meta.total - 1, 0) };
      return { rodzaj: "gotowy", wpisy, meta };
    });
  }

  async function wykonaj(rodzaj: RodzajDecyzji, wpis: WpisDoDecyzji, komentarz: string) {
    if (zajete !== null) return;
    setZajete(wpis.id);
    setKomunikat(null);
    try {
      await zapiszDecyzje(rodzaj, wpis.id, komentarz);
      usunZListy(wpis.id);
      setOtwarta(null);
      setToast(
        rodzaj === "zatwierdz"
          ? `Dyżur zatwierdzony: ${nazwaOsoby(wpis)}.`
          : `${TEKSTY_DECYZJI[rodzaj].toast} ${nazwaOsoby(wpis)}.`,
      );
      const pozostale = stan.rodzaj === "gotowy" ? stan.wpisy.filter((w) => w.id !== wpis.id).length : 0;
      if (pozostale === 0) odswiez();
    } catch (blad: unknown) {
      const opis = sklasyfikujBladDecyzji(blad);
      if (opis.rodzaj === "pola") {
        const bladKomentarza = opis.bledy.comment?.[0] ?? Object.values(opis.bledy)[0]?.[0];
        setOtwarta((biezaca) => (biezaca ? { ...biezaca, blad: bladKomentarza } : biezaca));
      } else if (opis.rodzaj === "rozstrzygniety" || opis.rodzaj === "brak-wpisu") {
        setOtwarta(null);
        setKomunikat({ tytul: "Dyżur nie czeka już na decyzję", tresc: opis.komunikat });
        odswiez();
      } else {
        setKomunikat({ tytul: "Decyzja nie została zapisana", tresc: opis.komunikat });
      }
    } finally {
      setZajete(null);
    }
  }

  function otworz(wpis: WpisDoDecyzji, rodzaj: Exclude<RodzajDecyzji, "zatwierdz">) {
    setKomunikat(null);
    setOtwarta({ id: wpis.id, rodzaj, komentarz: "", blad: undefined });
  }

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Dyżury do decyzji"
      opis="Zatwierdź dyżur albo poproś o poprawkę. Odrzucenie jest ostateczne."
      onPowrot={() => router.back()}
    />
  );

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek} lista={<Skeleton wiersze={5} />} />;
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Dyżury do decyzji"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać dyżurów"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Żadne dane nie zostały zmienione.
          </Notice>
        }
      />
    );
  }

  const { wpisy, meta } = stan;

  const lista =
    wpisy.length === 0 ? (
      <>
        {komunikat && <KomunikatDecyzji komunikat={komunikat} />}
        <EmptyState
          naglowek="Brak wpisów do decyzji"
          tresc="Nowe dyżury pojawią się tutaj, gdy wolontariusze je zgłoszą."
          przycisk={{ etykieta: "Odśwież", onClick: ponow }}
        />
      </>
    ) : (
      <>
        {komunikat && <KomunikatDecyzji komunikat={komunikat} />}
        <ul className={style.lista} aria-label="Dyżury do decyzji">
          {wpisy.map((wpis) => (
            <li key={wpis.id} className={style.wiersz}>
              <div className={style.tresc}>
                <Badge wariant="pending">czeka na decyzję</Badge>
                <Text>{nazwaOsoby(wpis)}</Text>
                <Hint>
                  {`Dyżur z ${dataPolska(wpis.date)} · ${wpis.hours} h · ${etykietaFormy(wpis.form)} · konsultacje: ${wpis.consultations_count}`}
                </Hint>
                <div className={style.opis}>
                  {wpis.description ? <Text>{wpis.description}</Text> : <Hint>Bez opisu.</Hint>}
                </div>
              </div>
              <div className={style.akcje}>
                <Button
                  poziom="outline"
                  disabled={zajete !== null}
                  onClick={() => void wykonaj("zatwierdz", wpis, "")}
                >
                  Zatwierdź
                </Button>
                <Button poziom="quiet" disabled={zajete !== null} onClick={() => otworz(wpis, "odeslij")}>
                  {TEKSTY_DECYZJI.odeslij.etykieta}
                </Button>
                <Button poziom="quiet" disabled={zajete !== null} onClick={() => otworz(wpis, "odrzuc")}>
                  {TEKSTY_DECYZJI.odrzuc.etykieta}
                </Button>
              </div>
              {otwarta?.id === wpis.id && (
                <div className={style.decyzja}>
                  <FormSection
                    fokusPrzyOtwarciu
                    tytul={`${TEKSTY_DECYZJI[otwarta.rodzaj].tytul}: ${nazwaOsoby(wpis)}`}
                    pola={[
                      {
                        id: `komentarz-${wpis.id}`,
                        etykieta: TEKSTY_DECYZJI[otwarta.rodzaj].pole,
                        rodzaj: "wieloliniowy",
                        wymagane: true,
                        wartosc: otwarta.komentarz,
                        onZmiana: (wartosc) =>
                          setOtwarta((biezaca) => (biezaca ? { ...biezaca, komentarz: wartosc } : biezaca)),
                        blad: otwarta.blad,
                      },
                    ]}
                    etykietaAnuluj="Wróć do listy"
                    etykietaZapisz={TEKSTY_DECYZJI[otwarta.rodzaj].etykieta}
                    onAnuluj={() => setOtwarta(null)}
                    onZapisz={() => void wykonaj(otwarta.rodzaj, wpis, otwarta.komentarz)}
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

function KomunikatDecyzji({ komunikat }: { komunikat: KomunikatBledu }) {
  return (
    <Notice wariant="error" tytul={komunikat.tytul}>
      {komunikat.tresc}
    </Notice>
  );
}
