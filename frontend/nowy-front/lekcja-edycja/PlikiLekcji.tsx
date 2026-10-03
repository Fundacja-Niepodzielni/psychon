"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Text } from "@/design-system/atomy/Text/Text";
import { FileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { useRolaKursu } from "@/nowy-front/rola-kursu/kontekst";
import { LIMIT_LISTY_MATERIALOW, type MaterialAdmin } from "./dane";
import {
  czyPonowicOdczytPlikow,
  zdanieBleduOdczytuPlikow,
  zdanieBleduUsunieciaMaterialu,
  zdanieLiczbyMaterialow,
  zdanieObcietejListyPlikow,
  ZDANIE_WCZYTYWANIA_PLIKOW,
} from "./formularz";
import { useWgrywanieMaterialow } from "./materialy";
import { opisPliku } from "./nagranie";
import style from "./StronaLekcji.module.css";

interface WlasciwosciPlikowLekcji {
  idLekcji: number;
  /** Przedrostek identyfikatorów elementów karty — pole dodawania ma `{baza}-plik-materialu`. */
  baza: string;
  /** Liczba plików z zasobu lekcji; służy tylko do czasu pierwszej odpowiedzi odczytu listy. */
  liczbaStart: number;
  /** Ekran dowiaduje się, ile plików ma lekcja (karta „Stan lekcji”). */
  onLiczba: (liczba: number) => void;
}

/** Odczyt listy plików lekcji: `GET /admin/lessons/{lesson}/materials`. */
type Odczyt =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "gotowy"; pliki: MaterialAdmin[]; obcieta: boolean }
  | { rodzaj: "blad"; blad: unknown };

/**
 * Treść karty „Pliki do tej lekcji”: wszystkie pliki lekcji z odczytu serwera
 * (kolejność serwera) w jednym wspólnym wyglądzie wiersza — plik wgrany
 * wcześniej i plik dodany teraz — z licznikiem równym długości listy.
 * Dodanie i usunięcie odświeżają listę i licznik bez przeładowania strony.
 * Nieudany odczyt nie blokuje dodawania plików: karta mówi o błędzie zdaniem
 * i daje „Spróbuj ponownie”.
 */
export function PlikiLekcji({ idLekcji, baza, liczbaStart, onLiczba }: WlasciwosciPlikowLekcji) {
  const { dane } = useRolaKursu();
  const [odczyt, setOdczyt] = useState<Odczyt>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [usuniete, setUsuniete] = useState<number[]>([]);
  const [ogloszenie, setOgloszenie] = useState("");
  const [materialDoUsuniecia, setMaterialDoUsuniecia] = useState<MaterialAdmin | null>(null);
  const [bladUsuniecia, setBladUsuniecia] = useState<string | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  const zdanieLicznika = useRef<HTMLDivElement>(null);
  /** Miejsce na liście, które zajmował usunięty plik — z niego wynika, gdzie ma pójść fokus. */
  const miejsceFokusu = useRef<number | null>(null);

  const materialy = useWgrywanieMaterialow(
    (plik) => dane.wgrajMaterial(idLekcji, plik),
    (material) => setOgloszenie(`Wgrano plik „${material.name}”.`),
  );
  // Plik wgrany do końca stoi w jednym wierszu — na liście z „Usuń”. Wiersz stanu zostaje
  // tylko dla pliku, który się jeszcze wgrywa albo którego wgranie się nie udało.
  const plikiWToku = materialy.pliki.filter((plik) => plik.stan !== "gotowy");

  useEffect(() => {
    let aktualne = true;
    dane.pobierzMaterialyLekcji(idLekcji).then(
      (pliki) => {
        if (!aktualne) return;
        if (!Array.isArray(pliki)) {
          setOdczyt({ rodzaj: "blad", blad: new Error("Odpowiedź bez listy plików.") });
          return;
        }
        setOdczyt({ rodzaj: "gotowy", pliki, obcieta: pliki.length >= LIMIT_LISTY_MATERIALOW });
      },
      (blad: unknown) => {
        if (aktualne) setOdczyt({ rodzaj: "blad", blad });
      },
    );
    return () => {
      aktualne = false;
    };
  }, [idLekcji, proba, dane]);

  // Odczyt z serwera, a za nim pliki dodane na tym ekranie, których odczyt jeszcze nie zna;
  // plik usunięty na tym ekranie nie wraca z odpowiedzi odczytu, która wyszła przed usunięciem.
  const zSerwera = odczyt.rodzaj === "gotowy" ? odczyt.pliki : [];
  const widoczne = [...zSerwera, ...materialy.wgrane.filter((wgrany) => !zSerwera.some((plik) => plik.id === wgrany.id))].filter(
    (plik) => !usuniete.includes(plik.id),
  );
  const liczba = odczyt.rodzaj === "gotowy" ? widoczne.length : liczbaStart + widoczne.length;

  useEffect(() => {
    onLiczba(liczba);
  }, [liczba, onLiczba]);

  // Po usunięciu wiersza fokus idzie na „Usuń” następnego wiersza, a gdy usunięto ostatni — na zdanie licznika.
  useEffect(() => {
    const miejsce = miejsceFokusu.current;
    if (miejsce === null) return;
    miejsceFokusu.current = null;
    const przyciski = lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    (przyciski[miejsce] ?? zdanieLicznika.current)?.focus();
  }, [usuniete]);

  async function usunPlik(material: MaterialAdmin) {
    setMaterialDoUsuniecia(null);
    setBladUsuniecia(null);
    const miejsce = widoczne.findIndex((plik) => plik.id === material.id);
    try {
      await dane.usunMaterial(material.id);
      if (materialy.wgrane.some((wgrany) => wgrany.id === material.id)) materialy.zdejmij(material);
      miejsceFokusu.current = Math.max(0, miejsce);
      setUsuniete((poprzednie) => [...poprzednie, material.id]);
    } catch (blad) {
      setBladUsuniecia(zdanieBleduUsunieciaMaterialu(blad, material.name));
    }
  }

  function ponowOdczyt() {
    setOdczyt({ rodzaj: "ladowanie" });
    setProba((poprzednia) => poprzednia + 1);
  }

  return (
    <>
      <div ref={zdanieLicznika} tabIndex={-1} className={style.zdanieLicznika}>
        <Text>{zdanieLiczbyMaterialow(liczba)}</Text>
      </div>
      {odczyt.rodzaj === "ladowanie" && <Hint>{ZDANIE_WCZYTYWANIA_PLIKOW}</Hint>}
      {odczyt.rodzaj === "blad" && (
        <Notice
          wariant="error"
          tytul="Nie wczytano listy plików"
          akcja={
            czyPonowicOdczytPlikow(odczyt.blad) ? (
              <Button poziom="outline" type="button" onClick={ponowOdczyt}>
                Spróbuj ponownie
              </Button>
            ) : undefined
          }
        >
          {zdanieBleduOdczytuPlikow(odczyt.blad)}
        </Notice>
      )}
      {widoczne.length > 0 && (
        <ul ref={lista} className={style.pliki} aria-label="Pliki lekcji">
          {widoczne.map((material) => (
            <li key={material.id} className={style.plik}>
              <span className={style.nazwaPliku}>
                <strong className={style.nazwaDwieLinie} title={material.name}>
                  {material.name}
                </strong>
                {opisPliku(material.name, material.size) !== "" && (
                  <span className={style.drobne}>{opisPliku(material.name, material.size)}</span>
                )}
              </span>
              <Button
                poziom="quiet"
                type="button"
                aria-label={`Usuń plik ${material.name}`}
                onClick={() => setMaterialDoUsuniecia(material)}
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
      {odczyt.rodzaj === "gotowy" && odczyt.obcieta && <Hint>{zdanieObcietejListyPlikow(LIMIT_LISTY_MATERIALOW)}</Hint>}
      {bladUsuniecia && (
        <Notice wariant="error" tytul="Plik nie został usunięty">
          {bladUsuniecia}
        </Notice>
      )}
      <FileDropZone
        id={`${baza}-plik-materialu`}
        etykieta="Dodaj plik"
        podpowiedz="Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Plik może mieć najwyżej 10 MB."
        pliki={plikiWToku}
        onWybierzPliki={(wybrane) => void materialy.dodaj(wybrane)}
      />
      <p role="status" className={style.tylkoCzytnika}>
        {ogloszenie}
      </p>
      {materialDoUsuniecia && (
        <Dialog
          tytul={`Usunąć plik „${materialDoUsuniecia.name}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń plik"
          onWycofaj={() => setMaterialDoUsuniecia(null)}
          onPotwierdz={() => void usunPlik(materialDoUsuniecia)}
        >
          <Text>Pliku nie da się przywrócić.</Text>
        </Dialog>
      )}
    </>
  );
}
