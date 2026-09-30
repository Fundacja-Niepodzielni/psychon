import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { DetailTemplate } from "../szablony/DetailTemplate/DetailTemplate";
import { LessonTemplate } from "../szablony/LessonTemplate/LessonTemplate";
import { DashboardTemplate } from "../szablony/DashboardTemplate/DashboardTemplate";
import { CourseTree, type TematCourseTree } from "../organizmy/CourseTree/CourseTree";
import { TimeChart } from "../organizmy/TimeChart/TimeChart";
import { LessonPlayer } from "../organizmy/LessonPlayer/LessonPlayer";
import { QaBlock } from "../molekuly/QaBlock/QaBlock";

// Poligon pomiarowy trzech szablonów strumienia B (DetailTemplate,
// LessonTemplate, DashboardTemplate) — osobne wejście obok `index.html`,
// `lekcja.html` i `formularze.html` (żaden z nich nietknięty przez tę
// zmianę). Motyw sterowany parametrem ?theme=dark|light, tak samo jak w
// pozostałych stronach poligonu.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
// Bez parametru poligon jest jasny (MVP tylko jasny): arkusz tokenów działa
// wyłącznie pod elementem z `data-theme`, więc atrybut jest ustawiany zawsze.
document.documentElement.setAttribute("data-theme", motyw === "dark" ? "dark" : "light");

const nic = () => {};
const LADOWANIE = { rodzaj: "ladowanie" } as const;
const BLAD = { rodzaj: "blad", tresc: "Serwer nie odpowiedział. Spróbuj za chwilę.", onPonow: nic } as const;

const TEMATY: TematCourseTree[] = [
  { id: "t1", tytul: "Temat 1: Wprowadzenie", lekcje: [{ id: "l1", tytul: "Powitanie", czasMin: 12 }] },
  { id: "t2", tytul: "Temat 2: Wywiad", lekcje: [{ id: "l2", tytul: "Struktura wywiadu", czasMin: 25 }] },
];
const AKCJE_CT = { onPrzenies: nic, onDodajLekcje: nic, onZmienTytulLekcji: nic, onZapisz: nic, onCofnij: nic, onPorzucWszystko: nic };
const PUSTY_CT = { naglowek: "Brak tematów", tresc: "Tematy pojawią się po dodaniu pierwszego.", przycisk: { etykieta: "Dodaj temat", onClick: nic } };

const DANE_WYKRESU = [
  { etykieta: "kwi", nauka: 8, superwizja: 2 },
  { etykieta: "maj", nauka: 12, superwizja: 3 },
];

function naglowek(tytul: string) {
  return { okruszki: [{ etykieta: "Panel", href: "#" }, { etykieta: tytul }], tytul, onPowrot: nic };
}

const CHECKLIST = {
  tytul: "Braki do publikacji",
  braki: [{ id: "b1", tekst: "Dodaj co najmniej jedną lekcję", href: "#glowna" }],
  gotowe: [{ id: "g1", tekst: "Tytuł kursu uzupełniony" }],
  onZamknij: nic,
};

const KAFLE = [{ id: "k1", etykieta: "Ukończone lekcje", mianownik: "lekcji", wartosc: 4, procent: 40, dominujacy: true }];

const WSPOLNE_LP = {
  tytul: "Wprowadzenie do wywiadu",
  tresc: "Wywiad psychologiczny to rozmowa strukturalna z osobą zgłaszającą się po pomoc.",
  krokiRazem: 7,
  krokiZrobione: 2,
  materialy: [{ id: "m1", nazwa: "Karta pracy.pdf", href: "#" }],
  pytania: [] as never[],
  onZadajPytanie: nic,
  czasTrwaniaSekund: 1200,
  progUkonczenia: 60,
  pusty: { naglowek: "Brak treści", tresc: "Treść pojawi się po publikacji.", przycisk: { etykieta: "Wróć", onClick: nic } },
};

function Poligon() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 40 }}>
      <p>Poligon pomiarowy — DetailTemplate, LessonTemplate, DashboardTemplate — nie jest stroną produktu.</p>

      {(["z-danymi", "pusty", "blad", "ladowanie"] as const).map((stanNazwa) => (
        <div data-style-id={`detailtemplate-${stanNazwa}`} key={`d-${stanNazwa}`}>
          <DetailTemplate
            naglowek={naglowek("Szczegół kursu")}
            checklist={stanNazwa === "z-danymi" ? CHECKLIST : undefined}
            kafle={stanNazwa === "z-danymi" ? KAFLE : undefined}
            glowna={
              <CourseTree
                {...AKCJE_CT}
                tematy={stanNazwa === "pusty" ? [] : TEMATY}
                liczbaZmian={0}
                pusty={PUSTY_CT}
                stan={stanNazwa === "blad" ? BLAD : stanNazwa === "ladowanie" ? LADOWANIE : undefined}
              />
            }
            wspierajaca={
              <TimeChart
                tytul="Czas nauki"
                dane={stanNazwa === "pusty" ? [] : DANE_WYKRESU}
                jednostka="godz."
                zakres="kwiecień–maj 2026"
                stan={stanNazwa === "blad" ? BLAD : stanNazwa === "ladowanie" ? LADOWANIE : undefined}
              />
            }
          />
        </div>
      ))}

      {(["z-danymi", "pusty", "blad", "ladowanie"] as const).map((stanNazwa) => (
        <div data-style-id={`lessontemplate-${stanNazwa}`} key={`l-${stanNazwa}`}>
          <LessonTemplate
            naglowek={naglowek("Wprowadzenie do wywiadu")}
            checklist={stanNazwa === "z-danymi" ? CHECKLIST : undefined}
            pasekKrokow={stanNazwa === "z-danymi" ? <p>Krok 2 z 7</p> : undefined}
            glowna={
              <LessonPlayer
                {...WSPOLNE_LP}
                id={`lekcja-${stanNazwa}`}
                obejrzaneSekundy={stanNazwa === "pusty" ? 0 : 800}
                procentAktywnegoCzasu={stanNazwa === "pusty" ? 0 : 70}
                braki={[]}
                tresc={stanNazwa === "pusty" ? "" : WSPOLNE_LP.tresc}
                materialy={stanNazwa === "pusty" ? [] : WSPOLNE_LP.materialy}
                bezNagrania={stanNazwa === "pusty"}
                stan={stanNazwa === "blad" ? BLAD : stanNazwa === "ladowanie" ? LADOWANIE : undefined}
              />
            }
            wspierajaca={
              <QaBlock stan="czeka" pytanie="Czy termin superwizji można przesunąć?" obiecanyCzas="jutra" poPrzekroczeniu="Zobaczysz przypomnienie w dzienniku." />
            }
          />
        </div>
      ))}

      {(["z-danymi", "pusty", "blad", "ladowanie"] as const).map((stanNazwa) => (
        <div data-style-id={`dashboardtemplate-${stanNazwa}`} key={`p-${stanNazwa}`}>
          <DashboardTemplate
            naglowek={naglowek("Pulpit")}
            nastepnyKrok={stanNazwa === "z-danymi" ? <p>Wróć do lekcji: Wywiad psychologiczny</p> : undefined}
            kafle={stanNazwa === "z-danymi" ? KAFLE : undefined}
            glowna={
              <CourseTree
                {...AKCJE_CT}
                tematy={stanNazwa === "pusty" ? [] : TEMATY}
                liczbaZmian={0}
                pusty={PUSTY_CT}
                stan={stanNazwa === "blad" ? BLAD : stanNazwa === "ladowanie" ? LADOWANIE : undefined}
              />
            }
            wspierajaca={
              <TimeChart
                tytul="Czas nauki"
                dane={stanNazwa === "pusty" ? [] : DANE_WYKRESU}
                jednostka="godz."
                zakres="kwiecień–maj 2026"
                stan={stanNazwa === "blad" ? BLAD : stanNazwa === "ladowanie" ? LADOWANIE : undefined}
              />
            }
          />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Poligon />);
