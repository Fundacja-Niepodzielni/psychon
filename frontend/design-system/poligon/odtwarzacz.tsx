import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Heading } from "../atomy/Heading/Heading";
import { Button } from "../atomy/Button/Button";
import { POCHODZENIE_ODTWARZACZA } from "../../lib/konfiguracja/odtwarzacz-nagran";
import { adresObcejRamki } from "./adres-obcej-ramki";
import { RecordingPlayer, type PowodBleduNagrania } from "../organizmy/RecordingPlayer/RecordingPlayer";

// Poligon odtwarzacza nagrania w ramce. Adres ramki wskazuje dozwolone
// pochodzenie z budowy poligonu — domenę zastrzeżoną dla prób, pod którą ramkę
// podaje atrapa (`e2e/odtwarzacz-nagrania-w-ramce.spec.ts`). Parametry:
// `?start=<sekundy>` — pozycja startowa; `?adres=<adres>` — inny adres ramki;
// `?obca=<adres>` — dodatkowa, obca ramka obok odtwarzacza (próba odrzucania
// jej komunikatów); przyjmowany jest wyłącznie adres https w domenie atrapy prób. Motyw jak na pozostałych stronach: `?theme=dark|light`.
const parametry = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", parametry.get("theme") === "dark" ? "dark" : "light");
const start = parametry.get("start");
const adres = parametry.get("adres") ?? `${POCHODZENIE_ODTWARZACZA}/embed/nagranie-pokazowe?token=pokaz&expires=0`;
const obca = adresObcejRamki(parametry.get("obca"));

interface Stan {
  gotowa: number;
  obejrzane: number;
  aktywne: number;
  pozycja: number | null;
  zmiany: boolean[];
  konce: number;
  bledy: PowodBleduNagrania[];
  prosbyOAdres: number;
}

const POCZATEK: Stan = { gotowa: 0, obejrzane: 0, aktywne: 0, pozycja: null, zmiany: [], konce: 0, bledy: [], prosbyOAdres: 0 };

function Strona() {
  const [stan, setStan] = useState<Stan>(POCZATEK);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <Heading stopien={1}>Odtwarzacz nagrania w ramce</Heading>
      <div>
        <Button poziom="outline" onClick={() => setStan(POCZATEK)}>
          Wyzeruj liczniki
        </Button>
      </div>
      <RecordingPlayer
        tytul="Wprowadzenie do wywiadu"
        adresRamki={adres}
        pozycjaStartowaSekund={start === null ? null : Number(start)}
        czasTrwaniaSekund={1800}
        onPostep={(postep) =>
          setStan((s) => ({
            ...s,
            obejrzane: s.obejrzane + postep.przyrostObejrzane,
            aktywne: s.aktywne + postep.przyrostAktywne,
            pozycja: postep.pozycjaSekund,
          }))
        }
        onZmianaOdtwarzania={(odtwarzane) => setStan((s) => ({ ...s, zmiany: [...s.zmiany, odtwarzane] }))}
        onKoniec={() => setStan((s) => ({ ...s, konce: s.konce + 1 }))}
        onGotowa={() => setStan((s) => ({ ...s, gotowa: s.gotowa + 1 }))}
        onBlad={(powod) => setStan((s) => ({ ...s, bledy: [...s.bledy, powod] }))}
        onOdswiezAdres={() => setStan((s) => ({ ...s, prosbyOAdres: s.prosbyOAdres + 1 }))}
      />
      <div>
        <Button poziom="outline" onClick={() => {}}>
          Kontrolka za odtwarzaczem
        </Button>
      </div>
      {obca !== null && <iframe src={obca} title="Obca ramka obok odtwarzacza" data-testid="obca-ramka" />}
      <pre data-testid="zgloszenia" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13 }}>
        {JSON.stringify(stan)}
      </pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Strona />);
