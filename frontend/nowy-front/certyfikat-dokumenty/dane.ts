/**
 * Dane ekranów „Certyfikat” i „Dokumenty” uczestnika. Te same żądania co stare
 * strony `/panel/certyfikat` i `/panel/dokumenty` (spis: `POMIAR-STAREGO-EKRANU.md`),
 * z tymi samymi polami — żadnych nowych tras:
 *  - `GET /certificate/conditions`  (`backend/routes/api/h13.php`)
 *  - `POST /certificate/generate`   (j.w.)
 *  - `GET /certificate/download`    (j.w.) — z tokenem, bezpośrednio przez `fetch`
 *  - `GET /documents`               (H14) — lista i `meta.extra.available_types`
 *  - `POST /documents/generate`     (H14)
 *  - pobranie dokumentu: podpisany adres `download_url` z listy, przez `downloadFile`
 *
 * Odczyt biegnie z przeglądarki — ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
import { api, baseUrl, getToken } from "@/lib/api/klient";
import {
  fetchDocuments,
  generateDocument,
  type DocumentAvailableTypes,
  type DocumentDto,
  type DocumentType,
} from "@/lib/api/h14";
import { downloadFile } from "@/lib/api/pliki";

export type { DocumentAvailableTypes, DocumentDto, DocumentType };

/** Pojedynczy warunek z `GET /certificate/conditions`. */
export interface WarunekCertyfikatu {
  key: "courses" | "internship" | "supervision" | "workshop";
  label: string;
  done?: number | string;
  required?: number | string;
  met: boolean;
}

export interface WarunkiCertyfikatu {
  eligible: boolean;
  conditions: WarunekCertyfikatu[];
  /** Pole dodatkowe odpowiedzi; starsze odpowiedzi go nie mają. */
  passed_tests_count?: number | null;
}

export function pobierzWarunki(): Promise<WarunkiCertyfikatu> {
  return api<WarunkiCertyfikatu>("/certificate/conditions");
}

export function zlecCertyfikat(): Promise<unknown> {
  return api("/certificate/generate", { method: "POST" });
}

export const NAZWA_PLIKU_CERTYFIKATU = "certyfikat.html";

/**
 * Pobranie certyfikatu jak na starej stronie: `fetch` z tokenem pod ten sam adres.
 * `jeszcze-nie` to odpowiedź 404 (plik się jeszcze generuje); każdy inny kod
 * niż 2xx kończy się wyjątkiem.
 */
export async function pobierzCertyfikat(): Promise<{ rodzaj: "plik"; plik: Blob } | { rodzaj: "jeszcze-nie" }> {
  const odpowiedz = await fetch(`${baseUrl()}/certificate/download`, {
    headers: { Authorization: `Bearer ${(await getToken()) ?? ""}` },
  });
  if (odpowiedz.status === 404) return { rodzaj: "jeszcze-nie" };
  if (!odpowiedz.ok) throw new Error(String(odpowiedz.status));
  return { rodzaj: "plik", plik: await odpowiedz.blob() };
}

/** Zapis pliku przez tymczasowy odnośnik — ta sama sztuczka co `downloadFile`. */
export function zapiszPlik(plik: Blob, nazwa: string): void {
  const adres = URL.createObjectURL(plik);
  const odnosnik = document.createElement("a");
  odnosnik.href = adres;
  odnosnik.download = nazwa;
  document.body.appendChild(odnosnik);
  odnosnik.click();
  odnosnik.remove();
  URL.revokeObjectURL(adres);
}

export interface ListaDokumentow {
  documents: DocumentDto[];
  availableTypes: DocumentAvailableTypes | null;
}

export function pobierzDokumenty(): Promise<ListaDokumentow> {
  return fetchDocuments();
}

export function wystawDokument(rodzaj: DocumentType): Promise<DocumentDto> {
  return generateDocument(rodzaj);
}

/** Nazwa pliku jak na starej stronie: numer z ukośnikami zamienionymi na myślniki. */
export function nazwaPlikuDokumentu(dokument: DocumentDto): string {
  return `${dokument.number.replace(/\//g, "-")}.html`;
}

export function pobierzPlikDokumentu(dokument: DocumentDto): Promise<void> {
  return downloadFile(dokument.download_url, nazwaPlikuDokumentu(dokument));
}
