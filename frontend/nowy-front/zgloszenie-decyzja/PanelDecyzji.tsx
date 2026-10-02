"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useState } from "react";
import type { ApplicationRole } from "@/lib/h03/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import {
  OPCJE_ROL,
  adresKartyOsoby,
  dataPl,
  odrzucZgloszenie,
  rolaDomyslna,
  zaakceptujZgloszenie,
  type WynikAkceptacji,
  type WynikOdrzucenia,
  type Zgloszenie,
} from "./dane";
import style from "./ZgloszenieDecyzja.module.css";

type Uwaga = Exclude<WynikAkceptacji | WynikOdrzucenia, { rodzaj: "zaakceptowano" | "odrzucono" | "bledy-pol" }>;

interface WlasciwosciPanelu {
  zgloszenie: Zgloszenie;
  zaproszenie: "sent" | "failed" | null;
  onZaakceptowano: (userId: number, zaproszenie: "sent" | "failed") => void;
  onOdrzucono: (zgloszenie: Zgloszenie) => void;
  odswiez: () => void;
}

/**
 * Panel decyzji w kolumnie wspierającej. Zgłoszenie po decyzji pokazuje jej skutek
 * bez przycisku głównego; zgłoszenie czekające pokazuje albo wybór roli z „Zatwierdź
 * i utwórz konto”, albo (po „Odrzuć zgłoszenie”) pole powodu — nigdy oba naraz.
 * „Odrzuć zgłoszenie” (obrys, czerwony napis) stoi zawsze w ostatnim rzędzie panelu,
 * pod kreską, osobno od zatwierdzenia; przycisk główny jest najwyżej jeden.
 */
export function PanelDecyzji(wlasciwosci: WlasciwosciPanelu) {
  if (wlasciwosci.zgloszenie.status === "new") return <Decyzja {...wlasciwosci} />;
  return <PoDecyzji zgloszenie={wlasciwosci.zgloszenie} zaproszenie={wlasciwosci.zaproszenie} />;
}

function PoDecyzji({ zgloszenie, zaproszenie }: Pick<WlasciwosciPanelu, "zgloszenie" | "zaproszenie">) {
  if (zgloszenie.status === "accepted") {
    return (
      <section className={style.sekcja}>
        <Heading stopien={2}>Decyzja o zgłoszeniu</Heading>
        <Notice
          wariant="ok"
          tytul="Zgłoszenie zatwierdzone"
          akcja={
            zgloszenie.user_id !== null ? (
              <Link href={adresKartyOsoby(zgloszenie.user_id)}>Otwórz kartę osoby</Link>
            ) : undefined
          }
        >
          {`Konto zostało utworzone. Decyzja z ${dataPl(zgloszenie.decided_at)}.`}
        </Notice>
        {zaproszenie === "failed" && (
          <Notice wariant="warn" tytul="Zaproszenie nie zostało wysłane">
            Konto istnieje, ale wiadomość z zaproszeniem nie wyszła. Sprawdź skrzynkę e-maili.
          </Notice>
        )}
      </section>
    );
  }
  return (
    <section className={style.sekcja}>
      <Heading stopien={2}>Decyzja o zgłoszeniu</Heading>
      <Notice wariant="ok" tytul="Zgłoszenie odrzucone">
        {`Decyzja z ${dataPl(zgloszenie.decided_at)}. Powód: ${zgloszenie.rejection_reason ?? "—"}`}
      </Notice>
    </section>
  );
}

function Uwagi({ uwaga, odswiez }: { uwaga: Uwaga | null; odswiez: () => void }) {
  if (uwaga === null) return null;
  switch (uwaga.rodzaj) {
    case "istnieje-konto":
      return (
        <Notice
          wariant="error"
          tytul="Na ten adres jest już konto"
          akcja={
            uwaga.istniejacaOsoba !== null ? (
              <Link href={adresKartyOsoby(uwaga.istniejacaOsoba)}>Otwórz kartę osoby</Link>
            ) : undefined
          }
        >
          {uwaga.komunikat}
        </Notice>
      );
    case "limit-miejsc":
      return (
        <Notice wariant="warn" tytul="Brak wolnych miejsc w roku programu">
          {`${uwaga.komunikat}${
            uwaga.limit !== null && uwaga.zajete !== null ? ` Limit: ${uwaga.limit}, zajęte: ${uwaga.zajete}.` : ""
          } Kolejne kliknięcie zatwierdzi zgłoszenie mimo limitu.`}
        </Notice>
      );
    case "rozstrzygniete":
      return (
        <Notice
          wariant="warn"
          tytul="Zgłoszenie jest już rozstrzygnięte"
          akcja={
            <Button poziom="outline" onClick={odswiez}>
              Wczytaj zgłoszenie ponownie
            </Button>
          }
        >
          {uwaga.komunikat}
        </Notice>
      );
    case "brak-uprawnien":
      return (
        <Notice wariant="error" tytul="Ta decyzja jest poza Twoimi uprawnieniami">
          {uwaga.komunikat}
        </Notice>
      );
    case "nie-znaleziono":
      return (
        <Notice wariant="error" tytul="Nie znaleziono zgłoszenia">
          {uwaga.komunikat}
        </Notice>
      );
    case "blad":
      return (
        <Notice wariant="error" tytul="Decyzja nie została zapisana">
          {uwaga.komunikat}
        </Notice>
      );
  }
}

function Decyzja({ zgloszenie, onZaakceptowano, onOdrzucono, odswiez }: WlasciwosciPanelu) {
  const [tryb, setTryb] = useState<"decyzja" | "odrzucenie">("decyzja");
  const [rola, setRola] = useState<string>(rolaDomyslna(zgloszenie.role));
  const [powod, setPowod] = useState("");
  const [bledy, setBledy] = useState<{ rola?: string; powod?: string }>({});
  const [uwaga, setUwaga] = useState<Uwaga | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  useZgloszenieNiezapisanychZmian(
    (tryb === "odrzucenie" && powod.trim() !== "") || rola !== rolaDomyslna(zgloszenie.role),
    "Decyzja o zgłoszeniu",
  );
  const mimoLimitu = uwaga?.rodzaj === "limit-miejsc";

  // Pole powodu otwiera się działaniem osoby, więc fokus idzie na nie.
  useEffect(() => {
    if (tryb === "odrzucenie") document.getElementById("powod-odrzucenia")?.focus();
  }, [tryb]);

  async function akceptuj() {
    if (wysylanie) return;
    setWysylanie(true);
    setBledy({});
    const wynik = await zaakceptujZgloszenie(zgloszenie.id, rola as ApplicationRole, mimoLimitu);
    setWysylanie(false);
    if (wynik.rodzaj === "zaakceptowano") {
      onZaakceptowano(wynik.userId, wynik.zaproszenie);
    } else if (wynik.rodzaj === "bledy-pol") {
      setUwaga(null);
      setBledy({ rola: wynik.bledy.role?.[0] ?? wynik.komunikat });
    } else {
      setUwaga(wynik);
    }
  }

  async function odrzuc() {
    if (wysylanie) return;
    const tekst = powod.trim();
    if (tekst === "") {
      setBledy({ powod: "Podaj powód odrzucenia zgłoszenia." });
      return;
    }
    setWysylanie(true);
    setBledy({});
    const wynik = await odrzucZgloszenie(zgloszenie.id, tekst);
    setWysylanie(false);
    if (wynik.rodzaj === "odrzucono") {
      onOdrzucono(wynik.zgloszenie);
    } else if (wynik.rodzaj === "bledy-pol") {
      setUwaga(null);
      setBledy({ powod: wynik.bledy.reason?.[0] ?? wynik.komunikat });
    } else {
      setUwaga(wynik);
    }
  }

  const odrzucenie = tryb === "odrzucenie";

  return (
    <section className={style.sekcja}>
      <Heading stopien={2}>Decyzja o zgłoszeniu</Heading>
      <Uwagi uwaga={uwaga} odswiez={odswiez} />
      {odrzucenie ? (
        <>
          <Field
            id="powod-odrzucenia"
            etykieta="Powód odrzucenia"
            rodzaj="wieloliniowy"
            wymagane
            wartosc={powod}
            onZmiana={setPowod}
            blad={bledy.powod}
            podpowiedz="Powód zostaje zapisany przy zgłoszeniu. Kandydat nie dostaje go w wiadomości."
          />
          <div className={style.rzad}>
            <Button
              poziom="outline"
              onClick={() => {
                setTryb("decyzja");
                setBledy({});
                setUwaga(null);
              }}
            >
              Wróć do decyzji
            </Button>
          </div>
        </>
      ) : (
        <>
          <Text>
            Zatwierdzenie tworzy konto w roku programu i wysyła zaproszenie z linkiem aktywacyjnym. Dostęp do materiałów
            trwa 6 miesięcy od decyzji.
          </Text>
          <Field
            id="rola-konta"
            etykieta="Rola konta"
            rodzaj="wybor"
            wymagane
            opcje={OPCJE_ROL}
            wartosc={rola}
            onZmiana={setRola}
            blad={bledy.rola}
            podpowiedz="Domyślnie rola wskazana w zgłoszeniu."
          />
          <div className={style.rzad}>
            <Button poziom="primary" onClick={() => void akceptuj()}>
              {wysylanie ? "Zapisywanie…" : mimoLimitu ? "Zatwierdź mimo limitu miejsc" : "Zatwierdź i utwórz konto"}
            </Button>
          </div>
        </>
      )}
      {/* Odrzucenie zawsze w tym samym miejscu: ostatni rząd panelu, pod kreską,
          osobno od zatwierdzenia. Pierwsze kliknięcie otwiera pole powodu,
          kolejne — z wpisanym powodem — wysyła decyzję. */}
      <div className={style.rzadOdrzucenia} data-testid="rzad-odrzucenia">
        <Button
          poziom="outline"
          niebezpieczny
          onClick={() => {
            if (odrzucenie) {
              void odrzuc();
              return;
            }
            setTryb("odrzucenie");
            setBledy({});
            setUwaga(null);
          }}
        >
          {odrzucenie && wysylanie ? "Zapisywanie…" : "Odrzuć zgłoszenie"}
        </Button>
      </div>
    </section>
  );
}
