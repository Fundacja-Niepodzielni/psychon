"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { KomunikatStanu } from "../kursy-uczestnika-lista/KomunikatStanu";
import { rodzajBledu, type RodzajBledu } from "../pulpit/rodzaj-bledu";
import { pobierzProfil, zapiszProfil, type Profil } from "./dane";
import { doZadania, sklasyfikujBladZapisu, zProfilu, type BladZapisu, type Formularz, type KluczPola } from "./formularz";
import { FormularzDanych, ID_PRZYCISKU_ZAPISU } from "./FormularzDanych";
import { KartaEksportu } from "./KartaEksportu";
import { KartaZgod } from "./KartaZgod";
import { PotwierdzenieZapisu } from "./PotwierdzenieZapisu";
import style from "./ProfilUczestnika.module.css";

type StanEkranu = "ladowanie" | RodzajBledu | "ok";

type StanZapisu =
  | { stan: "spoczynek" }
  | { stan: "zapisywanie" }
  | { stan: "zapisano" }
  | { stan: "blad"; blad: BladZapisu & { numer: number } };

const OKRUSZKI = [{ etykieta: "Mój profil" }];

/**
 * Ekran „Mój profil” uczestnika (stara strona: `app/(uczestnik)/panel/profil/page.tsx`)
 * na szablonie `DetailTemplate`: w kolumnie głównej karta „Dane osobowe” (formularz),
 * obok niej karta „Eksport danych (RODO)” i karta „Zgody” (tylko odczyt). Te same trasy
 * i pola co dotąd — `GET /me`, `PATCH /me` oraz przebieg eksportu w `KartaEksportu`.
 *
 * Zapis: po sukcesie formularz wypełnia się odpowiedzią serwera, pojawia się
 * potwierdzenie z fokusem; po błędzie fokus trafia na podsumowanie błędów. Każda zmiana
 * pola zdejmuje potwierdzenie. Niezapisane zmiany zgłaszają się do wspólnego pytania
 * o wyjście z ekranu.
 *
 * Stany bez danych: ładowanie, brak połączenia, błąd serwera, brak dostępu (401/403) i
 * „nie znaleziono” (404) — te dwie ostatnie na wspólnym ekranie odmowy.
 */
export function ProfilUczestnika() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [profil, setProfil] = useState<Profil | null>(null);
  const [formularz, setFormularz] = useState<Formularz | null>(null);
  const [zapis, setZapis] = useState<StanZapisu>({ stan: "spoczynek" });
  const [numerBledu, setNumerBledu] = useState(0);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    pobierzProfil().then(
      (dane) => {
        if (straz?.anulowane) return;
        setProfil(dane);
        setFormularz(zProfilu(dane));
        setStan("ok");
      },
      (wyjatek: unknown) => {
        if (!straz?.anulowane) setStan(rodzajBledu(wyjatek));
      },
    );
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  const niezapisane = profil !== null && formularz !== null && !rowneWartosci(formularz, zProfilu(profil));
  useZgloszenieNiezapisanychZmian(niezapisane, "Mój profil");

  function zmien(klucz: KluczPola, wartosc: string) {
    setFormularz((poprzedni) => (poprzedni === null ? poprzedni : { ...poprzedni, [klucz]: wartosc }));
    // Każda zmiana pola zdejmuje potwierdzenie zapisu; błędy zostają do następnego zapisu.
    setZapis((poprzedni) => (poprzedni.stan === "zapisano" ? { stan: "spoczynek" } : poprzedni));
  }

  async function zapisz() {
    if (formularz === null) return;
    setZapis({ stan: "zapisywanie" });
    try {
      const zapisany = await zapiszProfil(doZadania(formularz));
      setProfil(zapisany);
      setFormularz(zProfilu(zapisany));
      setZapis({ stan: "zapisano" });
    } catch (wyjatek) {
      const numer = numerBledu + 1;
      setNumerBledu(numer);
      setZapis({ stan: "blad", blad: { ...sklasyfikujBladZapisu(wyjatek), numer } });
    }
  }

  const naglowek = {
    okruszki: OKRUSZKI,
    tytul: "Mój profil",
    opis: "Twoje dane osobowe, zgody i eksport danych.",
    onPowrot: () => router.back(),
  };

  if (stan !== "ok" || profil === null || formularz === null) {
    return (
      <DetailTemplate
        naglowek={naglowek}
        glowna={<TrescBezDanych stan={stan === "ok" ? "ladowanie" : stan} onPonow={ponow} />}
        wspierajaca={null}
      />
    );
  }

  return (
    <>
      <DetailTemplate
        naglowek={naglowek}
        glowna={
          <FormularzDanych
            formularz={formularz}
            email={profil.email}
            zapisywanie={zapis.stan === "zapisywanie"}
            blad={zapis.stan === "blad" ? zapis.blad : null}
            onZmiana={zmien}
            onZapisz={() => void zapisz()}
          />
        }
        wspierajaca={
          <>
            <KartaEksportu />
            <KartaZgod zgody={profil.consents} />
          </>
        }
      />
      {zapis.stan === "zapisano" && (
        <PotwierdzenieZapisu
          komunikat="Zapisano zmiany."
          idPowrotuFokusu={ID_PRZYCISKU_ZAPISU}
          onZamknij={() => setZapis({ stan: "spoczynek" })}
        />
      )}
    </>
  );
}

function TrescBezDanych({ stan, onPonow }: { stan: StanEkranu; onPonow: () => void }) {
  const router = useRouter();

  switch (stan) {
    case "siec":
      return (
        <KomunikatStanu
          tytul="Brak połączenia"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </KomunikatStanu>
      );
    case "blad":
      return (
        <KomunikatStanu
          tytul="Nie udało się wczytać profilu"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </KomunikatStanu>
      );
    case "zakazane":
      return (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="uczestników"
          przycisk={{ onClick: () => router.push(ADRES_PULPITU) }}
        />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="profilu"
          stopien={2}
          coDalej="Nie mamy dla Ciebie danych profilu do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
    default:
      return (
        <div className={style.ladowanie}>
          <div role="status">
            <Text>Wczytywanie profilu…</Text>
          </div>
          <Skeleton wiersze={6} />
        </div>
      );
  }
}
