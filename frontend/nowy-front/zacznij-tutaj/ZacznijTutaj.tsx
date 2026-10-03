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
  adresOsadzenia,
  czyAdministracja,
  KOMUNIKAT_BLEDU_WCZYTANIA,
  PODPIS_BEZ_FILMU,
  type EkranZacznijTutaj,
  type SekcjaFilmu,
} from "./logika";
import style from "./ZacznijTutaj.module.css";

interface Me {
  role: string;
  program_completed_at: string | null;
}

const TYTUL = "Zacznij tutaj";

function Film({ film }: { film: SekcjaFilmu }) {
  if (film.url) {
    return (
      <div className={style.ramka}>
        <iframe
          className={style.film}
          src={adresOsadzenia(film.url)}
          title={film.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className={style.bezFilmu}>
      <Text>{film.caption ?? PODPIS_BEZ_FILMU}</Text>
    </div>
  );
}

function Tresc({ ekran }: { ekran: EkranZacznijTutaj }) {
  return (
    <>
      <Karta ciepla>
        <Heading stopien={2}>{ekran.video.title}</Heading>
        <Film film={ekran.video} />
        {ekran.video.url && ekran.video.caption && <Text>{ekran.video.caption}</Text>}
      </Karta>
      <Karta>
        <Heading stopien={2}>{ekran.program.title}</Heading>
        <div className={style.tekst}>
          <Text>{ekran.program.body}</Text>
        </div>
      </Karta>
      <Karta>
        <Heading stopien={2}>{ekran.expectations.title}</Heading>
        <div className={style.tekst}>
          <Text>{ekran.expectations.body}</Text>
        </div>
      </Karta>
    </>
  );
}

/**
 * Ekran „Zacznij tutaj” w nowym wyglądzie — te same odczyty co
 * `app/(uczestnik)/panel/start/page.tsx`: `GET /onboarding` razem z `GET /me`
 * (błąd `/me` nie psuje ekranu). Administracja widzi datę ostatniej zmiany i
 * odnośnik do edycji treści; osoba po programie — odnośnik do ekranu po programie.
 * Film osadza się wyłącznie przez regułę `adresOsadzenia`.
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
