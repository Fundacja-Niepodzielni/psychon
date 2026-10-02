"use client";

import { useEffect, useState } from "react";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import type { AdminUserListItem } from "@/lib/api/h18";
import {
  assignSupervisorToMany,
  fetchInstructors,
  type SupervisorAssignmentToManyResponse,
} from "@/lib/api/przypisanie-prowadzacego";
import { nazwaOsoby } from "./dane";
import {
  BRAK_WYBORU_PROWADZACEGO,
  rodzajBleduPrzypisania,
  zdanieZmiany,
  type RodzajBleduPrzypisania,
  type Wybor,
} from "./wybor";

interface WlasciwosciOknaPrzypisania {
  wybor: Wybor;
  /** Zamknięcie bez wyniku; `poBledzie` — po błędzie serwera, gdy stan listy jest niepewny. */
  onAnuluj: (poBledzie: boolean) => void;
  /** Odpowiedź serwera po przypisaniu — ekran zamyka okno i odświeża listę. */
  onPrzypisano: (odpowiedz: SupervisorAssignmentToManyResponse) => void;
}

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; prowadzacy: AdminUserListItem[] }
  | { rodzaj: "blad"; blad: RodzajBleduPrzypisania };

const ID_POLA = "przypisanie-prowadzacy";

const ZDANIE_BRAKU_UPRAWNIEN =
  "Przypisywanie prowadzących jest tylko dla administracji. Zaznaczenie zostało bez zmian.";
const ZDANIE_BLEDU_SERWERA =
  "Serwer nie potwierdził przypisania. Część osób mogła już dostać prowadzącego — po zamknięciu okna lista pokaże stan z serwera. Spróbuj jeszcze raz.";

/**
 * Okno „Przypisz prowadzącego” na wspólnym organizmie `Dialog`: pole wyboru
 * „Prowadzący” (kandydaci z `GET /admin/users?role=instructor`), zdanie
 * o zmianie prowadzącego, gdy dotyczy choć jednej zaznaczonej osoby, oraz
 * „Anuluj” i „Przypisz (N)”. `Dialog` w obecnej wersji nie ma nieaktywnego
 * potwierdzenia (a przycisk główny nigdy nie jest nieaktywny), więc bez
 * wybranego prowadzącego przyczyna „Wybierz prowadzącego.” stoi pod polem,
 * a kliknięcie niczego nie wysyła i oznacza pole jako błędne.
 */
export function OknoPrzypisania({ wybor, onAnuluj, onPrzypisano }: WlasciwosciOknaPrzypisania) {
  const [lista, setLista] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [wybrany, setWybrany] = useState("");
  const [pokazBrak, setPokazBrak] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<RodzajBleduPrzypisania | null>(null);

  useEffect(() => {
    let anulowane = false;
    fetchInstructors()
      .then((prowadzacy) => {
        if (!anulowane) setLista({ rodzaj: "dane", prowadzacy });
      })
      .catch((wyjatek: unknown) => {
        if (!anulowane) setLista({ rodzaj: "blad", blad: rodzajBleduPrzypisania(wyjatek) });
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const idProwadzacego = wybrany === "" ? null : Number(wybrany);
  const zmiana = zdanieZmiany(wybor, idProwadzacego);
  const liczba = wybor.size;

  async function przypisz() {
    if (wysylanie) return;
    if (idProwadzacego === null) {
      setPokazBrak(true);
      return;
    }
    setWysylanie(true);
    setBlad(null);
    try {
      onPrzypisano(await assignSupervisorToMany(idProwadzacego, Array.from(wybor.keys())));
    } catch (wyjatek) {
      setBlad(rodzajBleduPrzypisania(wyjatek));
      setWysylanie(false);
    }
  }

  const opcje = [
    { wartosc: "", etykieta: "Nie wybrano" },
    ...(lista.rodzaj === "dane"
      ? lista.prowadzacy.map((osoba) => ({ wartosc: String(osoba.id), etykieta: nazwaOsoby(osoba) }))
      : []),
  ];

  const podpowiedz =
    lista.rodzaj === "ladowanie"
      ? "Wczytywanie listy prowadzących…"
      : idProwadzacego === null && !pokazBrak
        ? BRAK_WYBORU_PROWADZACEGO
        : undefined;

  return (
    <Dialog
      tytul="Przypisz prowadzącego"
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia={wysylanie ? "Przypisywanie…" : `Przypisz (${liczba})`}
      onWycofaj={() => onAnuluj(blad === "serwer")}
      onPotwierdz={() => void przypisz()}
    >
      <Text>
        Wybrany prowadzący zostanie przypisany zaznaczonym osobom: {liczba}. Osoby, które już go mają, zostaną bez
        zmian.
      </Text>
      {lista.rodzaj === "blad" && (
        <Notice wariant="error" tytul="Nie udało się wczytać listy prowadzących">
          {lista.blad === "brak-uprawnien"
            ? ZDANIE_BRAKU_UPRAWNIEN
            : "Sprawdź połączenie z internetem, zamknij okno i spróbuj jeszcze raz."}
        </Notice>
      )}
      <Field
        id={ID_POLA}
        etykieta="Prowadzący"
        rodzaj="wybor"
        opcje={opcje}
        wartosc={wybrany}
        onZmiana={(wartosc) => {
          setWybrany(wartosc);
          setPokazBrak(false);
        }}
        zablokowany={lista.rodzaj !== "dane" || wysylanie}
        podpowiedz={podpowiedz}
        blad={pokazBrak && idProwadzacego === null ? BRAK_WYBORU_PROWADZACEGO : undefined}
      />
      {zmiana !== null && (
        <Notice wariant="warn" tytul="Zmiana prowadzącego">
          {zmiana}
        </Notice>
      )}
      {wysylanie && (
        <div role="status">
          <Text>Trwa przypisywanie prowadzącego…</Text>
        </div>
      )}
      {blad !== null && (
        <Notice
          wariant="error"
          tytul={blad === "brak-uprawnien" ? "Brak uprawnień do przypisania" : "Nie udało się przypisać prowadzącego"}
        >
          {blad === "brak-uprawnien" ? ZDANIE_BRAKU_UPRAWNIEN : ZDANIE_BLEDU_SERWERA}
        </Notice>
      )}
    </Dialog>
  );
}
