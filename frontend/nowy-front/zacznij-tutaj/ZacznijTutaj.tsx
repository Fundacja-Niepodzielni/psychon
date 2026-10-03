"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { api } from "@/lib/api";
import { formatujDateICzas } from "../wspolne/daty";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import {
  ADRES_EDYTORA,
  ADRES_PO_PROGRAMIE,
  czyAdministracja,
  KOMUNIKAT_BLEDU_WCZYTANIA,
  PIASKOWNICA_ODTWARZACZA,
  PODPIS_BEZ_FILMU,
  POLITYKA_ODSYLACZA_ODTWARZACZA,
  pokazanieFilmu,
  type EkranZacznijTutaj,
  type SekcjaFilmu,
} from "./logika";
import style from "./ZacznijTutaj.module.css";

interface Me {
  role: string;
  program_completed_at: string | null;
}

const TYTUL = "Zacznij tutaj";

/** Czy tekst z serwera ma treść — puste pola (treść jeszcze niewypełniona) nie dają pustego nagłówka ani akapitu. */
function maTresc(tekst: string | null | undefined): tekst is string {
  return typeof tekst === "string" && tekst.trim() !== "";
}

/** Nagłówek sekcji tylko z treścią — jak dawna karta, która bez tytułu nie miała nagłówka. */
function TytulSekcji({ tekst }: { tekst: string }) {
  return maTresc(tekst) ? <Heading stopien={2}>{tekst}</Heading> : null;
}

/** Tekst sekcji tylko z treścią. */
function TekstSekcji({ tekst }: { tekst: string }) {
  return maTresc(tekst) ? (
    <div className={style.tekst}>
      <Text>{tekst}</Text>
    </div>
  ) : null;
}

function Film({ film }: { film: SekcjaFilmu }) {
  if (film.url) {
    const pokazanie = pokazanieFilmu(film.url);
    if (pokazanie.rodzaj === "odtwarzacz") {
      return (
        <div className={style.ramka}>
          <iframe
            className={style.film}
            src={pokazanie.adres}
            title={film.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sandbox={PIASKOWNICA_ODTWARZACZA}
            referrerPolicy={POLITYKA_ODSYLACZA_ODTWARZACZA}
          />
        </div>
      );
    }
    if (pokazanie.rodzaj === "odnosnik") {
      return (
        <Text>
          <Link href={pokazanie.adres} target="_blank" rel="noopener noreferrer">
            Otwórz film w nowej karcie
          </Link>
        </Text>
      );
    }
    return null;
  }
  const podpis = film.caption ?? PODPIS_BEZ_FILMU;
  return <div className={style.bezFilmu}>{maTresc(podpis) && <Text>{podpis}</Text>}</div>;
}

function Tresc({ ekran }: { ekran: EkranZacznijTutaj }) {
  return (
    <>
      <Karta ciepla>
        <TytulSekcji tekst={ekran.video.title} />
        <Film film={ekran.video} />
        {ekran.video.url && maTresc(ekran.video.caption) && <Text>{ekran.video.caption}</Text>}
      </Karta>
      <Karta>
        <TytulSekcji tekst={ekran.program.title} />
        <TekstSekcji tekst={ekran.program.body} />
      </Karta>
      <Karta>
        <TytulSekcji tekst={ekran.expectations.title} />
        <TekstSekcji tekst={ekran.expectations.body} />
      </Karta>
    </>
  );
}

/**
 * Ekran „Zacznij tutaj” w nowym wyglądzie — te same odczyty co
 * `app/(uczestnik)/panel/start/page.tsx`: `GET /onboarding` razem z `GET /me`
 * (błąd `/me` nie psuje ekranu). Administracja widzi datę ostatniej zmiany i
 * odnośnik do edycji treści; osoba po programie — odnośnik do ekranu po programie.
 * Film pokazuje się wyłącznie według reguły `pokazanieFilmu`: odtwarzacz YouTube
 * w piaskownicy, inny adres `https` jako odnośnik w nowej karcie, reszta — nic.
 */
export function ZacznijTutaj() {
  const router = useRouter();
  const [ekran, setEkran] = useState<EkranZacznijTutaj | null>(null);
  const [rola, setRola] = useState<string | null>(null);
  const [ukonczono, setUkonczono] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let aktywne = true;
    Promise.all([api<EkranZacznijTutaj>("/onboarding"), api<Me>("/me").catch(() => null)])
      .then(([dane, me]) => {
        if (!aktywne) return;
        setEkran(dane);
        setRola(me?.role ?? null);
        setUkonczono(me?.program_completed_at ?? null);
      })
      .catch(() => {
        if (aktywne) setBlad(KOMUNIKAT_BLEDU_WCZYTANIA);
      });
    return () => {
      aktywne = false;
    };
  }, [proba]);

  function ponow() {
    setBlad(null);
    setProba((n) => n + 1);
  }

  const administracja = czyAdministracja(rola);

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: TYTUL }]}
      tytul={TYTUL}
      onPowrot={() => router.back()}
      akcja={ekran && administracja ? { etykieta: "Edytuj treść", href: ADRES_EDYTORA } : undefined}
    />
  );

  let lista;
  if (blad) {
    lista = (
      <Komunikat
        wariant="error"
        tytul="Nie udało się wczytać danych"
        akcja={
          <Button poziom="outline" type="button" onClick={ponow}>
            Spróbuj ponownie
          </Button>
        }
      >
        <p>{blad}</p>
      </Komunikat>
    );
  } else if (!ekran) {
    lista = <Wczytywanie etykieta="Wczytywanie ekranu startowego…" wiersze={6} />;
  } else {
    lista = (
      <div className={style.stos}>
        {ukonczono && (
          <Komunikat wariant="info">
            <p>
              Program ukończony {formatujDateICzas(ukonczono)}.{" "}
              <Link href={ADRES_PO_PROGRAMIE}>Przejdź do ekranu po programie</Link>.
            </p>
          </Komunikat>
        )}
        {administracja && <p className={style.zmiana}>Ostatnia zmiana treści: {formatujDateICzas(ekran.updated_at)}</p>}
        <Tresc ekran={ekran} />
      </div>
    );
  }

  return <ListTemplate naglowek={naglowek} lista={lista} />;
}
