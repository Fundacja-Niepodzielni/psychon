"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { formatRozmiaru, rodzajPliku } from "@/nowy-front/lekcja-edycja/nagranie";
import { ZDANIE_BLEDU_POBRANIA } from "@/nowy-front/pliki-kursu/ListaPlikow";
import { pobierzPlik } from "@/nowy-front/pliki-kursu/dane";
import type { PlikZMime } from "./kurs";
import style from "./Lekcja.module.css";

const RODZAJE_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/zip": "ZIP",
  "text/plain": "TXT",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "video/mp4": "MP4",
  "audio/mpeg": "MP3",
};

/** Rodzaj pliku: z `mime` odczytu kursu, a bez niego (zaplecze sprzed zmiany) z rozszerzenia nazwy. */
export function rodzajPlikuLekcji(plik: Pick<PlikZMime, "name" | "mime">): string | null {
  const zMime = typeof plik.mime === "string" ? RODZAJE_MIME[plik.mime.toLowerCase()] : undefined;
  return zMime ?? rodzajPliku(plik.name);
}

/** „PDF · 241 KB” — to, co ekran wie o pliku. */
export function opisPlikuLekcji(plik: Pick<PlikZMime, "name" | "mime" | "size">): string {
  return [rodzajPlikuLekcji(plik), plik.size === null ? null : formatRozmiaru(plik.size)].filter(Boolean).join(" · ");
}

interface WlasciwosciMaterialyLekcji {
  pliki: PlikZMime[];
  /** Ponowny odczyt kursu: świeże adresy pobrania (wygasają po 300 s). */
  odswiez: () => Promise<PlikZMime[] | null>;
}

/** Karta „Materiały do pobrania”; lekcja bez plików: nic nie renderuje. */
export function MaterialyLekcji({ pliki, odswiez }: WlasciwosciMaterialyLekcji) {
  const idNaglowka = useId();
  const [stany, setStany] = useState<Record<number, "trwa" | "blad">>({});
  const wTrakcie = useRef(new Set<number>());
  if (pliki.length === 0) return null;

  async function pobierz(plik: PlikZMime) {
    if (wTrakcie.current.has(plik.id)) return;
    wTrakcie.current.add(plik.id);
    setStany((poprzednie) => ({ ...poprzednie, [plik.id]: "trwa" }));
    const wynik = await pobierzPlik(plik, odswiez);
    wTrakcie.current.delete(plik.id);
    setStany((poprzednie) => {
      const nastepne = { ...poprzednie };
      if (wynik === "blad") nastepne[plik.id] = "blad";
      else delete nastepne[plik.id];
      return nastepne;
    });
  }

  return (
    <section className={style.karta} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Materiały do pobrania
      </Heading>
      <ul className={style.pliki}>
        {pliki.map((plik) => {
          const opis = opisPlikuLekcji(plik);
          const idBledu = `${idNaglowka}-blad-${plik.id}`;
          return (
            <li key={plik.id} className={style.plik}>
              <div className={style.plikWiersz}>
                <div className={style.plikOpis}>
                  <b>{plik.name}</b>
                  {opis !== "" && <span>{opis}</span>}
                </div>
                <Button
                  poziom="outline"
                  rozmiar="sm"
                  aria-label={`Pobierz: ${plik.name}${opis !== "" ? `, ${opis.replace(" · ", ", ")}` : ""}`}
                  aria-describedby={stany[plik.id] === "blad" ? idBledu : undefined}
                  onClick={() => void pobierz(plik)}
                >
                  Pobierz
                </Button>
              </div>
              {stany[plik.id] === "trwa" && <p className={style.plikStan}>Pobieranie…</p>}
              {stany[plik.id] === "blad" && (
                <div className={style.plikStan}>
                  <ErrorText id={idBledu}>{ZDANIE_BLEDU_POBRANIA}</ErrorText>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
