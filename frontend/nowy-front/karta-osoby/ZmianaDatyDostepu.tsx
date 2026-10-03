"use client";

import { useEffect, useState } from "react";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Dialog, type BladDialogu } from "@/design-system/organizmy/Dialog/Dialog";
import {
  PODPOWIEDZ_DATY,
  PODPOWIEDZ_POWODU,
  PODPOWIEDZ_SKROCENIA,
  czySkraca,
  dzisiajWWarszawie,
  najpozniejszaDataDostepu,
  opisObecnejDaty,
  sprawdzZmianeDaty,
  wynikZBleduZmianyDaty,
  zmienDateDostepu,
  type BledyZmianyDaty,
  type OsobaPoZmianieDaty,
} from "./daneDostepu";

interface WlasciwosciZmianyDaty {
  idOsoby: number;
  imieNazwisko: string;
  /** Obecna data końca dostępu z karty (`profile.access_expires_at`). */
  obecnaData: string | null;
  /** Serwer przyjął nową datę — wywołujący pokazuje ją w nagłówku i zamyka okno. */
  onZapisano: (osoba: OsobaPoZmianieDaty) => void;
  onWycofaj: () => void;
  /** Czy w oknie są wpisane, niezapisane dane (dla pytania przy zamknięciu karty przeglądarki). */
  onNiezapisaneZmiany?: (sa: boolean) => void;
}

const ID_DATY = "karta-zmiana-daty-data";
const ID_POWODU = "karta-zmiana-daty-powod";

function listaBledow(bledy: BledyZmianyDaty): BladDialogu[] {
  const lista: BladDialogu[] = [];
  if (bledy.data) lista.push({ tresc: bledy.data, idPola: ID_DATY });
  if (bledy.powod) lista.push({ tresc: bledy.powod, idPola: ID_POWODU });
  return lista;
}

/**
 * Okno „Zmień datę dostępu” na karcie osoby — wariant `formularz` wspólnego
 * okna (`Dialog`): nowa data (późniejsza niż dziś) i obowiązkowy powód.
 * Zapis idzie trasą `POST /admin/users/{id}/extend-access` z polami `until`
 * i `reason`; okno czeka na odpowiedź serwera, błędy pokazuje na górze, a po
 * sukcesie oddaje osobę z nową datą wywołującemu (`onZapisano`).
 */
export function OknoZmianyDatyDostepu({
  idOsoby,
  imieNazwisko,
  obecnaData,
  onZapisano,
  onWycofaj,
  onNiezapisaneZmiany,
}: WlasciwosciZmianyDaty) {
  const [teraz] = useState(() => new Date());
  const [data, setData] = useState("");
  const [powod, setPowod] = useState("");
  const [bledyPol, setBledyPol] = useState<BledyZmianyDaty>({});
  const [bledy, setBledy] = useState<BladDialogu[] | undefined>(undefined);
  const niezapisane = data !== "" || powod !== "";

  useEffect(() => {
    onNiezapisaneZmiany?.(niezapisane);
  }, [niezapisane, onNiezapisaneZmiany]);

  useEffect(() => {
    return () => onNiezapisaneZmiany?.(false);
  }, [onNiezapisaneZmiany]);

  function zapisz(): Promise<void> | void {
    const wynik = sprawdzZmianeDaty(data, powod, dzisiajWWarszawie(teraz));
    if ("bledy" in wynik) {
      setBledyPol(wynik.bledy);
      setBledy(listaBledow(wynik.bledy));
      return;
    }
    setBledyPol({});
    setBledy(undefined);
    return zmienDateDostepu(idOsoby, wynik.cialo).then(onZapisano, (wyjatek: unknown) => {
      const blad = wynikZBleduZmianyDaty(wyjatek);
      if (blad.rodzaj === "pola") {
        setBledyPol(blad.bledy);
        setBledy(listaBledow(blad.bledy));
      } else {
        setBledy([{ tresc: blad.tresc }]);
      }
    });
  }

  return (
    <Dialog
      wariant="formularz"
      tytul={`Zmień datę dostępu: ${imieNazwisko}`}
      opis={<Text>Obecna data dostępu: {opisObecnejDaty(obecnaData)}.</Text>}
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia="Zapisz datę"
      tytulBledow="Data dostępu nie została zmieniona"
      onWycofaj={onWycofaj}
      onPotwierdz={zapisz}
      bledy={bledy}
      niezapisaneZmiany={niezapisane}
    >
      <Field
        id={ID_DATY}
        etykieta="Nowa data dostępu"
        rodzaj="data"
        wymagane
        wartosc={data}
        maks={najpozniejszaDataDostepu(dzisiajWWarszawie(teraz))}
        onZmiana={setData}
        podpowiedz={czySkraca(obecnaData, data) ? PODPOWIEDZ_SKROCENIA : PODPOWIEDZ_DATY}
        blad={bledyPol.data}
      />
      <Field
        id={ID_POWODU}
        etykieta="Powód zmiany"
        rodzaj="wieloliniowy"
        wymagane
        wartosc={powod}
        onZmiana={setPowod}
        podpowiedz={PODPOWIEDZ_POWODU}
        blad={bledyPol.powod}
      />
    </Dialog>
  );
}
