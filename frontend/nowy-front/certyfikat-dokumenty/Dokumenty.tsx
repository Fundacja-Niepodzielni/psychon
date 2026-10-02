"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList, type WierszBezAkcjiRecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ApiError } from "@/lib/api/klient";
import { formatujDate } from "../wspolne/daty";
import { rodzajBledu } from "../pulpit/rodzaj-bledu";
import {
  pobierzDokumenty,
  pobierzPlikDokumentu,
  wystawDokument,
  type DocumentDto,
  type DocumentType,
  type ListaDokumentow,
} from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { Komunikat } from "./Komunikat";
import { ETYKIETY_RODZAJOW, nazwaPobraniaDokumentu, nazwaWydaniaDokumentu, stanyRodzajow } from "./logika";
import style from "./CertyfikatDokumenty.module.css";

const TYTUL = "Dokumenty";
const ADRES_PROFILU = "/panel/profil";

type StanEkranu = StanBezDanych | "ok";

/**
 * Ekran „Dokumenty” uczestnika na szablonie listy: lista wydanych dokumentów (nazwa, numer,
 * data wydania, pobranie) i lista rodzajów, które można wygenerować, z powodem, gdy jeszcze
 * nie można.
 *
 * Te same żądania i ten sam przebieg co stara strona `/panel/dokumenty`
 * (`POMIAR-STAREGO-EKRANU.md`): jeden odczyt `GET /documents` zasila obie listy, „Wygeneruj”
 * woła `POST /documents/generate` i czyta listę od nowa, „Pobierz” pobiera plik z podpisanego
 * adresu z tokenem. Ekran nie ma przycisku głównego — każde działanie należy do wiersza.
 */
export function Dokumenty() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [lista, setLista] = useState<ListaDokumentow | null>(null);
  const [pobierany, setPobierany] = useState<number | null>(null);
  const [wystawiany, setWystawiany] = useState<DocumentType | null>(null);
  const [bladPobrania, setBladPobrania] = useState<string | null>(null);
  const [bledyWydania, setBledyWydania] = useState<Partial<Record<DocumentType, string>>>({});
  const wTrakcie = useRef(false);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    return pobierzDokumenty().then(
      (dane) => {
        if (straz?.anulowane) return;
        setLista(dane);
        setStan("ok");
      },
      (wyjatek: unknown) => {
        if (straz?.anulowane) return;
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

  async function pobierz(dokument: DocumentDto) {
    if (wTrakcie.current) return;
    wTrakcie.current = true;
    setPobierany(dokument.id);
    setBladPobrania(null);
    try {
      await pobierzPlikDokumentu(dokument);
    } catch (wyjatek) {
      setBladPobrania(wyjatek instanceof ApiError ? wyjatek.message : "Nie udało się pobrać dokumentu.");
    } finally {
      setPobierany(null);
      wTrakcie.current = false;
    }
  }

  async function wystaw(rodzaj: DocumentType) {
    if (wTrakcie.current) return;
    wTrakcie.current = true;
    setWystawiany(rodzaj);
    setBledyWydania((poprzednie) => ({ ...poprzednie, [rodzaj]: undefined }));
    try {
      await wystawDokument(rodzaj);
      await wczytaj();
    } catch (wyjatek) {
      const komunikat = wyjatek instanceof ApiError ? wyjatek.message : "Nie udało się wygenerować dokumentu.";
      setBledyWydania((poprzednie) => ({ ...poprzednie, [rodzaj]: komunikat }));
    } finally {
      setWystawiany(null);
      wTrakcie.current = false;
    }
  }

  if (stan !== "ok" || lista === null) {
    return (
      <EkranStanu
        stan={stan === "ok" ? "ladowanie" : stan}
        tytul={TYTUL}
        czego="dokumentów"
        czegoNieZnaleziono="dokumentów"
        rolaDocelowa="osób uczestniczących w programie"
        onPonow={ponow}
      />
    );
  }

  const wierszeDokumentow: WierszRecordList[] = lista.documents.map((dokument) => ({
    id: String(dokument.id),
    tytul: ETYKIETY_RODZAJOW[dokument.type],
    tytulDodatek: dokument.number,
    podpowiedz: `Wydano: ${formatujDate(dokument.generated_at)}`,
    akcja: {
      etykieta: pobierany === dokument.id ? "Pobieranie…" : "Pobierz PDF",
      etykietaDostepna: nazwaPobraniaDokumentu(dokument),
      onKliknij: () => void pobierz(dokument),
    },
  }));

  const wierszeRodzajow: Array<WierszRecordList | WierszBezAkcjiRecordList> = stanyRodzajow(lista.documents, lista.availableTypes).map(
    (rodzaj) => {
      const podstawa = {
        id: rodzaj.rodzaj,
        tytul: rodzaj.tytul,
        podpowiedz: opisRodzaju(rodzaj.wystawiony, rodzaj.mozeWygenerowac, rodzaj.wyjasnienie, wystawiany === rodzaj.rodzaj),
        plakietka: rodzaj.plakietka,
      };
      if (rodzaj.mozeWygenerowac) {
        return {
          ...podstawa,
          akcja: {
            etykieta: wystawiany === rodzaj.rodzaj ? "Generowanie…" : "Wygeneruj",
            etykietaDostepna: nazwaWydaniaDokumentu(rodzaj.rodzaj),
            onKliknij: () => void wystaw(rodzaj.rodzaj),
          },
        };
      }
      if (rodzaj.doProfilu) {
        return {
          ...podstawa,
          akcja: { etykieta: "Uzupełnij profil", etykietaDostepna: `Uzupełnij profil, aby wygenerować: ${rodzaj.tytul}`, href: ADRES_PROFILU },
        };
      }
      return podstawa;
    },
  );

  const bledyRodzajow = Object.entries(bledyWydania).filter((wpis): wpis is [DocumentType, string] => wpis[1] !== undefined);

  return (
    <ListTemplate
      naglowek={
        <PageHeader
          okruszki={[{ etykieta: TYTUL }]}
          tytul={TYTUL}
          opis="Dokumenty, które wydano Ci w programie, i te, które możesz jeszcze wygenerować."
          onPowrot={() => router.back()}
        />
      }
      lista={
        <div className={style.stos}>
          {bladPobrania && (
            <Komunikat wariant="error" tytul="Nie udało się pobrać dokumentu">
              {bladPobrania}
            </Komunikat>
          )}
          {bledyRodzajow.map(([rodzaj, komunikat]) => (
            <Komunikat key={rodzaj} wariant="error" tytul={`Nie udało się wygenerować: ${ETYKIETY_RODZAJOW[rodzaj]}`}>
              {komunikat}
            </Komunikat>
          ))}
          <RecordList
            tytul="Twoje dokumenty"
            stopienNaglowka={2}
            wiersze={wierszeDokumentow}
            pusty={{
              naglowek: "Brak dokumentów",
              tresc: "Nie masz jeszcze żadnych dokumentów. Poniżej zobaczysz, które możesz wygenerować.",
              przycisk: { etykieta: "Odśwież", onClick: () => void wczytaj() },
            }}
          />
          <RecordList
            tytul="Dokumenty do wygenerowania"
            stopienNaglowka={2}
            wiersze={wierszeRodzajow}
            pusty={{
              naglowek: "Brak rodzajów dokumentów",
              tresc: "Serwer nie zwrócił listy rodzajów dokumentów. Odśwież stronę.",
              przycisk: { etykieta: "Odśwież", onClick: ponow },
            }}
          />
        </div>
      }
    />
  );
}

function opisRodzaju(wystawiony: boolean, mozeWygenerowac: boolean, wyjasnienie: string | null, trwa: boolean): string | undefined {
  if (trwa) return "Trwa generowanie dokumentu.";
  if (wystawiony) return "Ten dokument masz już na liście powyżej.";
  if (mozeWygenerowac) return "Możesz wygenerować go teraz.";
  return wyjasnienie ?? undefined;
}
