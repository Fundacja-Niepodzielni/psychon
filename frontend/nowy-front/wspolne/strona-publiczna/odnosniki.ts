import type { OdnosnikStopki } from "@/design-system/szablony/StronaPubliczna/StronaPubliczna";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_TYPES } from "@/lib/h22/legal-documents";

export const ADRES_DEKLARACJI = "/deklaracja-dostepnosci";

/**
 * Odnośniki stopki stron publicznych — te same co w starej stopce
 * (`components/layout/PublicFooter.tsx`): deklaracja dostępności i każdy
 * rodzaj dokumentu prawnego, w tej samej kolejności i z tymi samymi
 * etykietami. Sama deklaracja nie dostaje odnośnika do siebie.
 */
export function odnosnikiStopkiPublicznej(bezDeklaracji = false): OdnosnikStopki[] {
  const dokumenty = LEGAL_DOCUMENT_TYPES.map((typ) => ({
    etykieta: LEGAL_DOCUMENT_LABELS[typ],
    href: `/dokumenty-prawne/${typ}`,
  }));
  return bezDeklaracji ? dokumenty : [{ etykieta: "Deklaracja dostępności", href: ADRES_DEKLARACJI }, ...dokumenty];
}
