import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Heading } from "../atomy/Heading/Heading";
import { EdytorTresci } from "../molekuly/EdytorTresci/EdytorTresci";
import { TRESC_PONAD_LIMIT, TRESC_PRZYKLADOWA, TRESC_SPOZA_PODZBIORU } from "./edytor-przyklady";

// Poligon edytora treści lekcji: osobna strona wejścia, bo tylko ona wciąga
// silnik edycji. Każdy stan ma własny `data-style-id`; `?stan=<nazwa>` pokazuje
// jeden stan, `?zrzut=1` chowa podgląd tekstu wysyłanego. Motyw jak na
// pozostałych stronach poligonu: `?theme=dark|light`, domyślnie jasny.
const parametry = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", parametry.get("theme") === "dark" ? "dark" : "light");
const wybranyStan = parametry.get("stan");
const bezPodgladu = parametry.get("zrzut") === "1";

const STANY: { nazwa: string; tytul: string; tresc: string }[] = [
  { nazwa: "pusty", tytul: "Pusty", tresc: "" },
  { nazwa: "tresc", tytul: "Z treścią", tresc: TRESC_PRZYKLADOWA },
  { nazwa: "limit", tytul: "Ponad limit znaków", tresc: TRESC_PONAD_LIMIT },
  { nazwa: "spoza", tytul: "Treść spoza podzbioru", tresc: TRESC_SPOZA_PODZBIORU },
];

function Stan({ nazwa, tytul, tresc }: { nazwa: string; tytul: string; tresc: string }) {
  const [wartosc, setWartosc] = useState(tresc);
  const [zmiany, setZmiany] = useState(0);
  return (
    <section
      data-style-id={`edytor-${nazwa}`}
      aria-labelledby={`edytor-${nazwa}-tytul`}
      style={{
        maxWidth: 604,
        padding: 20,
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Heading stopien={2} id={`edytor-${nazwa}-tytul`}>
        {`Treść lekcji — ${tytul.toLowerCase()}`}
      </Heading>
      <EdytorTresci
        id={`edytor-${nazwa}`}
        wartosc={wartosc}
        onZmiana={(tekst) => {
          setWartosc(tekst);
          setZmiany((liczba) => liczba + 1);
        }}
      />
      {!bezPodgladu && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          <p style={{ margin: 0 }}>
            Zgłoszone zmiany: <span data-testid={`zmiany-${nazwa}`}>{zmiany}</span>. Tekst wysyłany:
          </p>
          <pre data-testid={`tekst-${nazwa}`} style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(wartosc)}
          </pre>
        </div>
      )}
    </section>
  );
}

function Poligon() {
  const stany = STANY.filter((stan) => wybranyStan === null || stan.nazwa === wybranyStan);
  return (
    <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24, background: "var(--bg)", minHeight: "100vh" }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Poligon edytora treści lekcji — nie jest stroną produktu</h1>
      {stany.map((stan) => (
        <Stan key={stan.nazwa} {...stan} />
      ))}
    </main>
  );
}

const korzen = document.getElementById("root");
if (korzen !== null) {
  createRoot(korzen).render(<Poligon />);
}
