"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { PublishChecklist } from "@/design-system/organizmy/PublishChecklist/PublishChecklist";
import { checklistaPublikacji, type WynikDanychKursu } from "./dane";
import style from "./KursPublikacja.module.css";
import { KOMUNIKAT_SERWER } from "@/nowy-front/wspolne/komunikaty";

interface WlasciwosciKursPublikacja {
  idKursu: string;
  wynik: WynikDanychKursu;
}

/**
 * Trasa `/nowy-front/kurs/[id]` — pierwszy konsument tokenów warstwy 1
 * i atomów/organizmu warstwy 2 w działającej aplikacji (nie na poligonie).
 * Wariant stały organizmu O7 w kolumnie, jak w A-12 (`06-ATOMY §4`, O7).
 *
 * Pięć stanów trasy (`06-ATOMY §7`): `brak-sesji`, `brak-uprawnien`, `blad`,
 * `pusty`, `ok` — patrz `dane.ts`. Stanu „po zapisaniu” brak: trasa nigdy
 * nie zapisuje nic do API (tylko GET), więc nie ma zdarzenia zapisu do
 * pokazania — nazwany jawnie jako OPEN w piśmie zdawczym, nie udawany tu.
 *
 * `Button primary` „Opublikuj kurs” to JEDYNY element z tłem `--primary` na
 * tej stronie (cel 1) i realizuje zachowanie O7 z w. 171: panel ukryty
 * do kliknięcia przycisku głównego, wyjście oddaje fokus temu przyciskowi.
 */
export function KursPublikacja({ idKursu, wynik }: WlasciwosciKursPublikacja) {
  const router = useRouter();
  const [otwarty, setOtwarty] = useState(false);
  const idPrzycisku = useId();

  if (wynik.status === "brak-sesji") {
    return (
      <div className={style.uklad}>
        <Heading stopien={1}>Kurs {idKursu}</Heading>
        <Text>
          Nie ma aktywnej sesji. Zaloguj się ponownie, aby zobaczyć checklistę
          publikacji.
        </Text>
      </div>
    );
  }
  if (wynik.status === "brak-uprawnien") {
    return (
      <div className={style.uklad}>
        <Heading stopien={1}>Kurs {idKursu}</Heading>
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Publikacja kursu dla prowadzących"
          rola="prowadzących"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </div>
    );
  }
  if (wynik.status === "blad") {
    return (
      <div className={style.uklad}>
        <Heading stopien={1}>Kurs {idKursu}</Heading>
        <Text>{KOMUNIKAT_SERWER}</Text>
      </div>
    );
  }

  const { kurs, lekcje } = wynik.dane;

  if (wynik.status === "pusty") {
    return (
      <div className={style.uklad}>
        <Heading stopien={1}>{kurs.title}</Heading>
        <Text>
          Kurs jeszcze pusty — bez lekcji i bez materiałów. Dodaj treść, zanim
          checklista publikacji będzie miała co sprawdzić.
        </Text>
      </div>
    );
  }

  const { braki, gotowe } = checklistaPublikacji({ kurs, lekcje });

  return (
    <div className={style.uklad}>
      <div className={style.naglowek}>
        <Heading stopien={1}>{kurs.title}</Heading>
        <Badge wariant={kurs.is_published ? "ok" : "neutral"}>
          {kurs.is_published ? "Opublikowany" : "Szkic"}
        </Badge>
      </div>
      <Text>{kurs.description ?? "Kurs bez opisu."}</Text>

      <Button id={idPrzycisku} poziom="primary" onClick={() => setOtwarty(true)}>
        Opublikuj kurs
      </Button>

      {otwarty && (
        <div className={style.kolumnaBoczna}>
          <PublishChecklist
            tytul="Braki przed publikacją"
            braki={braki}
            gotowe={gotowe}
            onZamknij={() => {
              setOtwarty(false);
              document.getElementById(idPrzycisku)?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
