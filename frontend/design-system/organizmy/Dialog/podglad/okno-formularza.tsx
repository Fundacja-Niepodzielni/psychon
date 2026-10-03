import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../tokeny/tokeny.css";
import { Button } from "../../../atomy/Button/Button";
import { Heading } from "../../../atomy/Heading/Heading";
import { Text } from "../../../atomy/Text/Text";
import { Field } from "../../../molekuly/Field/Field";
import { Dialog, oglosWPanelu, type BladDialogu } from "../Dialog";

/**
 * Strona podglądu okna formularza — narzędzie prób przeglądarkowych
 * (`e2e/okno-formularza-podglad.spec.ts`), nie strona produktu. Budowana
 * przez Vite wprost z tego katalogu w samej próbie; dane przykładowe są
 * zmyślone. Parametr `?serwer=blad` udaje odmowę serwera, `?serwer=wolny`
 * — długą odpowiedź, `?pytanie=dlugie` — długą treść krótkiego pytania
 * „Na pewno?” (drugie okno strony, wariant `potwierdzenie`).
 */

const parametry = new URLSearchParams(window.location.search);
const SERWER = parametry.get("serwer");
const DLUGIE_PYTANIE = parametry.get("pytanie") === "dlugie";

const OPCJE_GRUPY = [
  { wartosc: "psychon", etykieta: "PsychON" },
  { wartosc: "dobrostan", etykieta: "Dobrostan" },
  { wartosc: "both", etykieta: "PsychON i Dobrostan" },
];

function czytelnaData(iso: string): string {
  const [rok, miesiac, dzien] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(rok, miesiac - 1, dzien)),
  );
}

function Podglad() {
  const [otwarte, setOtwarte] = useState(false);
  const [data, setData] = useState("2027-02-01");
  const [nowaData, setNowaData] = useState("");
  const [powod, setPowod] = useState("");
  const [grupa, setGrupa] = useState("psychon");
  const [bledy, setBledy] = useState<BladDialogu[] | undefined>(undefined);
  const [wyslania, setWyslania] = useState(0);
  const [pytanie, setPytanie] = useState(false);

  function otworz() {
    setNowaData("");
    setPowod("");
    setGrupa("psychon");
    setBledy(undefined);
    setOtwarte(true);
  }

  function zapisz(): Promise<void> | void {
    const nowe: BladDialogu[] = [];
    if (nowaData === "") nowe.push({ tresc: "Wybierz nową datę dostępu.", idPola: "podglad-data" });
    if (powod.trim() === "") nowe.push({ tresc: "Wpisz powód zmiany.", idPola: "podglad-powod" });
    if (nowe.length > 0) {
      setBledy(nowe);
      return;
    }
    setWyslania((liczba) => liczba + 1);
    return new Promise<void>((rozwiaz) => {
      window.setTimeout(
        () => {
          if (SERWER === "blad") {
            setBledy([{ tresc: "Serwer nie odpowiedział. Data dostępu nie została zmieniona — spróbuj ponownie." }]);
          } else {
            setData(nowaData);
            setOtwarte(false);
            oglosWPanelu(`Data dostępu zmieniona na ${czytelnaData(nowaData)}.`);
          }
          rozwiaz();
        },
        SERWER === "wolny" ? 3000 : 300,
      );
    });
  }

  return (
    <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 }}>
      <Heading stopien={1}>Podgląd okna formularza</Heading>
      <Text>Strona do prób okna: nie jest stroną produktu. Dane osoby są zmyślone.</Text>
      <section aria-labelledby="podglad-dostep" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Heading stopien={2} id="podglad-dostep">
          Dostęp do materiałów
        </Heading>
        <Text>
          Dostęp do materiałów do: <span data-testid="data-dostepu">{czytelnaData(data)}</span>
        </Text>
        <div>
          <Button poziom="outline" onClick={otworz}>
            Zmień datę
          </Button>
        </div>
        <Text>
          Liczba wysłań: <span data-testid="liczba-wyslan">{wyslania}</span>
        </Text>
        <div>
          <Button poziom="outline" onClick={() => setPytanie(true)}>
            Zaznacz warsztat jako zaliczony
          </Button>
        </div>
      </section>
      {Array.from({ length: 12 }, (_, indeks) => (
        <Text key={indeks}>
          Akapit wypełniający {indeks + 1}: strona jest dłuższa niż ekran, żeby próba sprawdziła, że pod otwartym oknem
          się nie przewija.
        </Text>
      ))}
      {pytanie && (
        <Dialog
          tytul="Zaznaczyć warsztat jako zaliczony?"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zaznacz jako zaliczony"
          onWycofaj={() => setPytanie(false)}
          onPotwierdz={() => setPytanie(false)}
        >
          <Text>Zaznaczysz warsztat stacjonarny jako zaliczony dla osoby Marta Demo.</Text>
          {DLUGIE_PYTANIE &&
            Array.from({ length: 30 }, (_, indeks) => (
              <Text key={indeks}>
                Dodatkowe zdanie {indeks + 1}: dłuższa treść pytania sprawdza, że przewija się wyłącznie środek okna.
              </Text>
            ))}
        </Dialog>
      )}
      {otwarte && (
        <Dialog
          wariant="formularz"
          tytul="Zmień datę dostępu: Marta Demo"
          opis={<Text>Obecnie dostęp do materiałów do {czytelnaData(data)}.</Text>}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zapisz datę"
          onWycofaj={() => setOtwarte(false)}
          onPotwierdz={zapisz}
          bledy={bledy}
          niezapisaneZmiany={nowaData !== "" || powod !== "" || grupa !== "psychon"}
          fokusPoZamknieciu="podglad-dostep"
        >
          <Field
            id="podglad-data"
            etykieta="Nowa data dostępu"
            rodzaj="data"
            wymagane
            wartosc={nowaData}
            onZmiana={setNowaData}
            blad={bledy?.find((blad) => blad.idPola === "podglad-data")?.tresc}
          />
          <Field
            id="podglad-powod"
            etykieta="Powód zmiany"
            rodzaj="wieloliniowy"
            wymagane
            podpowiedz="Pisz rzeczowo, bez informacji o zdrowiu."
            wartosc={powod}
            onZmiana={setPowod}
            blad={bledy?.find((blad) => blad.idPola === "podglad-powod")?.tresc}
          />
          <Field id="podglad-grupa" etykieta="Grupa produktowa" rodzaj="wybor" opcje={OPCJE_GRUPY} wartosc={grupa} onZmiana={setGrupa} />
          <Field id="podglad-uwagi" etykieta="Uwagi dla zespołu" rodzaj="wieloliniowy" podpowiedz="Pole nieobowiązkowe." />
        </Dialog>
      )}
    </main>
  );
}

const korzen = document.getElementById("root");
if (korzen) createRoot(korzen).render(<Podglad />);
