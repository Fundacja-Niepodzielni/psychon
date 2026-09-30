"use client";

import { useState } from "react";
import type { ApplicationRole } from "@/lib/h03/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
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
 * bez przycisku głównego; zgłoszenie czekające pokazuje albo wybór roli z „Zaakceptuj
 * i utwórz konto”, albo (po „Odrzuć zgłoszenie”) sekcję z powodem — nigdy oba naraz,
 * więc na ekranie jest jeden przycisk główny i jeden rząd przycisków.
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
          tytul="Zgłoszenie zaakceptowane"
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
          } Kolejne kliknięcie zaakceptuje zgłoszenie mimo limitu.`}
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
  const mimoLimitu = uwaga?.rodzaj === "limit-miejsc";

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

  if (tryb === "odrzucenie") {
    return (
      <div className={style.sekcja}>
        <Uwagi uwaga={uwaga} odswiez={odswiez} />
        <FormSection
          tytul="Odrzuć zgłoszenie"
          pola={[
            {
              id: "powod-odrzucenia",
              etykieta: "Powód odrzucenia",
              rodzaj: "wieloliniowy",
              wymagane: true,
              wartosc: powod,
              onZmiana: setPowod,
              blad: bledy.powod,
              podpowiedz: "Powód zostaje zapisany przy zgłoszeniu.",
            },
          ]}
          etykietaAnuluj="Wróć do decyzji"
          etykietaZapisz={wysylanie ? "Zapisywanie…" : "Odrzuć zgłoszenie"}
          onAnuluj={() => {
            setTryb("decyzja");
            setBledy({});
            setUwaga(null);
          }}
          onZapisz={() => void odrzuc()}
        />
      </div>
    );
  }

  return (
    <section className={style.sekcja}>
      <Heading stopien={2}>Decyzja o zgłoszeniu</Heading>
      <Text>
        Akceptacja tworzy konto w roku programu i wysyła zaproszenie z linkiem aktywacyjnym. Dostęp do materiałów
        trwa 6 miesięcy od decyzji.
      </Text>
      <Uwagi uwaga={uwaga} odswiez={odswiez} />
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
          {wysylanie ? "Zapisywanie…" : mimoLimitu ? "Zaakceptuj mimo limitu miejsc" : "Zaakceptuj i utwórz konto"}
        </Button>
        <Button
          poziom="outline"
          onClick={() => {
            setTryb("odrzucenie");
            setBledy({});
            setUwaga(null);
          }}
        >
          Odrzuć zgłoszenie
        </Button>
      </div>
    </section>
  );
}
