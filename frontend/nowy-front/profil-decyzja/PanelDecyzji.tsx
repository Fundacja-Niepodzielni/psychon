"use client";

import { useNawigacjaZPytaniem, useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { dataPl, odeslijWniosek, zaakceptujWniosek, type WynikDecyzji, type Wniosek } from "./dane";
import style from "./ProfilDecyzja.module.css";

type Uwaga = Exclude<WynikDecyzji, { rodzaj: "zapisano" | "bledy-pol" }>;

interface WlasciwosciPanelu {
  wniosek: Wniosek;
  onRozstrzygniety: (wniosek: Wniosek) => void;
  odswiez: () => void;
}

/**
 * Panel decyzji w kolumnie wspierającej. Wniosek, który nie czeka na decyzję,
 * pokazuje jej skutek bez przycisku głównego; wniosek złożony pokazuje albo
 * „Zatwierdź” z prośbą o poprawkę, albo (po „Poproś o poprawkę”) sekcję z
 * komentarzem — nigdy oba naraz, więc jest jeden przycisk główny i jeden rząd przycisków.
 */
export function PanelDecyzji(wlasciwosci: WlasciwosciPanelu) {
  if (wlasciwosci.wniosek.status === "submitted") return <Decyzja {...wlasciwosci} />;
  return <PoDecyzji wniosek={wlasciwosci.wniosek} />;
}

function PoDecyzji({ wniosek }: { wniosek: Wniosek }) {
  return (
    <section className={style.sekcja}>
      <Heading stopien={2}>Decyzja o wniosku</Heading>
      {wniosek.status === "accepted" && (
        <Notice wariant="ok" tytul="Wniosek zatwierdzony">
          {`Decyzja z ${dataPl(wniosek.decided_at)}.`}
        </Notice>
      )}
      {wniosek.status === "returned" && (
        <Notice wariant="ok" tytul="Poproszono o poprawkę wniosku">
          {`Decyzja z ${dataPl(wniosek.decided_at)}. Komentarz: ${wniosek.return_reason ?? "—"}`}
        </Notice>
      )}
      {wniosek.status !== "accepted" && wniosek.status !== "returned" && (
        <Notice wariant="warn" tytul="Wniosek nie czeka na decyzję">
          Decyzję można podjąć tylko dla wniosku złożonego przez osobę.
        </Notice>
      )}
    </section>
  );
}

function Uwagi({ uwaga, odswiez }: { uwaga: Uwaga | null; odswiez: () => void }) {
  if (uwaga === null) return null;
  switch (uwaga.rodzaj) {
    case "rozstrzygniete":
      return (
        <Notice
          wariant="warn"
          tytul="Wniosek jest już rozstrzygnięty"
          akcja={
            <Button poziom="outline" onClick={odswiez}>
              Wczytaj wniosek ponownie
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
        <Notice wariant="error" tytul="Nie znaleziono wniosku">
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

function Decyzja({ wniosek, onRozstrzygniety, odswiez }: WlasciwosciPanelu) {
  const { przejdz } = useNawigacjaZPytaniem();
  const [tryb, setTryb] = useState<"decyzja" | "poprawka">("decyzja");
  const [komentarz, setKomentarz] = useState("");
  const [bladKomentarza, setBladKomentarza] = useState<string | undefined>(undefined);
  const [uwaga, setUwaga] = useState<Uwaga | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  useZgloszenieNiezapisanychZmian(tryb === "poprawka" && komentarz.trim() !== "", "Decyzja o wniosku");

  async function akceptuj() {
    if (wysylanie) return;
    setWysylanie(true);
    const wynik = await zaakceptujWniosek(wniosek.id);
    setWysylanie(false);
    if (wynik.rodzaj === "zapisano") onRozstrzygniety(wynik.wniosek);
    else if (wynik.rodzaj === "bledy-pol") setUwaga({ rodzaj: "blad", komunikat: wynik.komunikat });
    else setUwaga(wynik);
  }

  async function odeslij() {
    if (wysylanie) return;
    const tekst = komentarz.trim();
    if (tekst === "") {
      setBladKomentarza("Napisz, co trzeba poprawić.");
      return;
    }
    setWysylanie(true);
    setBladKomentarza(undefined);
    const wynik = await odeslijWniosek(wniosek.id, tekst);
    setWysylanie(false);
    if (wynik.rodzaj === "zapisano") {
      onRozstrzygniety(wynik.wniosek);
    } else if (wynik.rodzaj === "bledy-pol") {
      setUwaga(null);
      setBladKomentarza(wynik.bledy.reason?.[0] ?? wynik.komunikat);
    } else {
      setUwaga(wynik);
    }
  }

  if (tryb === "poprawka") {
    return (
      <div className={style.sekcja}>
        <Uwagi uwaga={uwaga} odswiez={odswiez} />
        <FormSection
          fokusPrzyOtwarciu
          tytul="Poproś o poprawkę"
          pola={[
            {
              id: "komentarz-poprawki",
              etykieta: "Co trzeba poprawić",
              rodzaj: "wieloliniowy",
              wymagane: true,
              wartosc: komentarz,
              onZmiana: setKomentarz,
              blad: bladKomentarza,
              podpowiedz: "Komentarz zobaczy osoba, która złożyła wniosek.",
            },
          ]}
          etykietaAnuluj="Wróć do decyzji"
          etykietaZapisz={wysylanie ? "Zapisywanie…" : "Wyślij prośbę o poprawkę"}
          onAnuluj={() => {
            setTryb("decyzja");
            setBladKomentarza(undefined);
            setUwaga(null);
          }}
          onZapisz={() => void odeslij()}
        />
      </div>
    );
  }

  return (
    <section className={style.sekcja}>
      <Heading stopien={2}>Decyzja o wniosku</Heading>
      <Text>Osoba dostanie powiadomienie o decyzji. Poprawka wraca do niej razem z Twoim komentarzem.</Text>
      <Uwagi uwaga={uwaga} odswiez={odswiez} />
      <div className={style.rzad}>
        <Button poziom="primary" onClick={() => void akceptuj()}>
          {wysylanie ? "Zapisywanie…" : "Zatwierdź"}
        </Button>
        <Button
          poziom="outline"
          onClick={() => {
            setTryb("poprawka");
            setUwaga(null);
          }}
        >
          Poproś o poprawkę
        </Button>
        <span className={style.odsuniety}>
          <Button poziom="quiet" onClick={() => przejdz("/admin/profile")}>
            Wróć do listy
          </Button>
        </span>
      </div>
    </section>
  );
}
