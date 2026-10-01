"use client";

import { useState } from "react";
import type { PlikFileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import type { MaterialAdmin } from "./dane";
import { zdanieBleduPliku } from "./formularz";

/** Zastępuje wpis o tej samej nazwie albo dopisuje nowy (`FileRow` kluczuje po nazwie). */
function ustawPlik(lista: PlikFileDropZone[], plik: PlikFileDropZone): PlikFileDropZone[] {
  return lista.some((wpis) => wpis.nazwa === plik.nazwa)
    ? lista.map((wpis) => (wpis.nazwa === plik.nazwa ? plik : wpis))
    : [...lista, plik];
}

interface WgrywanieMaterialow {
  /** Stan plików dla `FileDropZone`. */
  pliki: PlikFileDropZone[];
  /** Materiały wgrane na tym ekranie — z identyfikatorami z serwera. */
  wgrane: MaterialAdmin[];
  dodaj: (lista: FileList) => Promise<void>;
  /** Zdejmuje materiał z listy po usunięciu go na serwerze. */
  zdejmij: (material: MaterialAdmin) => void;
}

/**
 * Wgrywanie materiałów — jedna logika dla materiałów lekcji i materiałów
 * kursu. Różni je wyłącznie funkcja `wgraj` (trasa lekcji albo trasa kursu);
 * kolejność, stany pliku i zdania błędów są wspólne.
 */
export function useWgrywanieMaterialow(
  wgraj: (plik: File) => Promise<MaterialAdmin>,
  onWgrano: (material: MaterialAdmin) => void,
): WgrywanieMaterialow {
  const [pliki, setPliki] = useState<PlikFileDropZone[]>([]);
  const [wgrane, setWgrane] = useState<MaterialAdmin[]>([]);

  async function dodaj(lista: FileList) {
    for (const plik of Array.from(lista)) {
      setPliki((poprzednie) =>
        ustawPlik(poprzednie, { nazwa: plik.name, stan: "przetwarzanie", komunikat: "Wgrywanie…" }),
      );
      try {
        const material = await wgraj(plik);
        setWgrane((poprzednie) => [...poprzednie, material]);
        onWgrano(material);
        setPliki((poprzednie) =>
          ustawPlik(poprzednie, { nazwa: plik.name, stan: "gotowy", komunikat: "Wgrano plik." }),
        );
      } catch (blad) {
        setPliki((poprzednie) =>
          ustawPlik(poprzednie, { nazwa: plik.name, stan: "blad", komunikat: zdanieBleduPliku(blad) }),
        );
      }
    }
  }

  function zdejmij(material: MaterialAdmin) {
    setWgrane((poprzednie) => poprzednie.filter((wpis) => wpis.id !== material.id));
    setPliki((poprzednie) => poprzednie.filter((wpis) => wpis.nazwa !== material.name));
  }

  return { pliki, wgrane, dodaj, zdejmij };
}
