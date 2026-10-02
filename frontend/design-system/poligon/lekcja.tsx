import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { CourseTree, type TematCourseTree } from "../organizmy/CourseTree/CourseTree";
import { TimeChart } from "../organizmy/TimeChart/TimeChart";
import { LessonPlayer } from "../organizmy/LessonPlayer/LessonPlayer";

// Poligon drzewa kursu, wykresu i bloku lekcji: osobna strona wejścia obok
// `index.html`. Każdy organizm ma tu warianty danych i stany: pusty,
// ładowanie, błąd. Motyw sterowany parametrem ?theme=dark|light, tak samo
// jak na stronie atomów i molekuł.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
// Bez parametru poligon jest jasny (MVP tylko jasny): arkusz tokenów działa
// wyłącznie pod elementem z `data-theme`, więc atrybut jest ustawiany zawsze.
document.documentElement.setAttribute("data-theme", motyw === "dark" ? "dark" : "light");

const nic = () => {};
const BLAD = { rodzaj: "blad", tresc: "Serwer nie odpowiedział. Twoje dane są bezpieczne — spróbuj za chwilę.", onPonow: nic } as const;
const LADOWANIE = { rodzaj: "ladowanie" } as const;

const DANE_WYKRESU = [
  { etykieta: "kwi", nauka: 8, superwizja: 2 },
  { etykieta: "maj", nauka: 12, superwizja: 3 },
  { etykieta: "cze", nauka: 10, superwizja: 4 },
  { etykieta: "lip", nauka: 14, superwizja: 3 },
  { etykieta: "sie", nauka: 16, superwizja: 5 },
  { etykieta: "wrz", nauka: 18, superwizja: 6 },
];

const TEMATY_CT: TematCourseTree[] = [
  {
    id: "temat-1",
    tytul: "Temat 1: Wprowadzenie",
    lekcje: [
      { id: "l1", tytul: "Powitanie", czasMin: 12 },
      { id: "l2", tytul: "Zasady programu", czasMin: 18 },
      { id: "l3", tytul: "Pierwsze zadanie", czasMin: 20 },
    ],
  },
  {
    id: "temat-2",
    tytul: "Temat 2: Wywiad psychologiczny",
    lekcje: [
      { id: "l4", tytul: "Struktura wywiadu", czasMin: 25 },
      { id: "l5", tytul: "Pytania trudne", czasMin: 30 },
    ],
  },
  {
    id: "temat-3",
    tytul: "Temat 3: Podsumowanie",
    lekcje: [{ id: "l6", tytul: "Zamknięcie kursu", czasMin: 15 }],
  },
];

const TEMATY_ZMIENIONE: TematCourseTree[] = TEMATY_CT.map((temat) => ({
  ...temat,
  lekcje: temat.lekcje.map((lekcja) => (lekcja.id === "l2" || lekcja.id === "l4" ? { ...lekcja, zmieniona: true } : lekcja)),
}));

const PUSTY_CT = {
  naglowek: "Ten kurs nie ma jeszcze tematów",
  tresc: "Tematy i lekcje pojawią się tu po dodaniu pierwszego tematu w edytorze kursu.",
  przycisk: { etykieta: "Dodaj pierwszy temat", onClick: nic },
};

const AKCJE_CT = {
  onPrzenies: nic,
  onDodajLekcje: nic,
  onZmienTytulLekcji: nic,
  onZapisz: nic,
  onCofnij: nic,
  onPorzucWszystko: nic,
  pusty: PUSTY_CT,
};

/** Drzewo z działającym przenoszeniem: numery, liczniki i znaczniki zmian przeliczają się przed zapisem. */
function DrzewoDemo() {
  const [tematy, setTematy] = useState(TEMATY_CT);
  const [liczbaZmian, setLiczbaZmian] = useState(0);

  function przenies(zTematu: string, lekcjaId: string, doTematu: string, docelowyIndeks: number) {
    setTematy((poprzednie) => {
      const lekcja = poprzednie.find((t) => t.id === zTematu)?.lekcje.find((l) => l.id === lekcjaId);
      if (!lekcja) return poprzednie;
      const bez = poprzednie.map((t) => (t.id === zTematu ? { ...t, lekcje: t.lekcje.filter((l) => l.id !== lekcjaId) } : t));
      return bez.map((t) => {
        if (t.id !== doTematu) return t;
        const lekcje = [...t.lekcje];
        lekcje.splice(docelowyIndeks, 0, { ...lekcja, zmieniona: true });
        return { ...t, lekcje };
      });
    });
    setLiczbaZmian((n) => n + 1);
  }

  function porzuc() {
    setTematy(TEMATY_CT);
    setLiczbaZmian(0);
  }

  return (
    <CourseTree
      {...AKCJE_CT}
      tematy={tematy}
      liczbaZmian={liczbaZmian}
      onPrzenies={przenies}
      onPorzucWszystko={porzuc}
      onZapisz={() => {
        setTematy((t) => t.map((temat) => ({ ...temat, lekcje: temat.lekcje.map((l) => ({ ...l, zmieniona: false })) })));
        setLiczbaZmian(0);
      }}
    />
  );
}

const TRESC_LEKCJI =
  "Wywiad psychologiczny to rozmowa strukturalna, która pozwala poznać sytuację osoby zgłaszającej się po pomoc.";

const PUSTY_LP = {
  naglowek: "Ta lekcja nie ma jeszcze treści",
  tresc: "Nagranie, tekst i materiały pojawią się tu, gdy prowadząca opublikuje lekcję.",
  przycisk: { etykieta: "Wróć do listy lekcji", onClick: nic },
};

const WSPOLNE_LP = {
  tytul: "Wprowadzenie do wywiadu",
  tresc: TRESC_LEKCJI,
  krokiRazem: 7,
  materialy: [{ id: "m1", nazwa: "Karta pracy.pdf", href: "#" }],
  onZadajPytanie: nic,
  czasTrwaniaSekund: 1200,
  progUkonczenia: 60,
  pusty: PUSTY_LP,
};

function Poligon() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
      <p>Poligon pomiarowy — kurs, wykres, lekcja; nie jest stroną produktu.</p>

      {/* O13 TimeChart — z danymi, pusty zakres, ładowanie, błąd */}
      <div data-style-id="o13-timechart-z-danymi">
        <TimeChart tytul="Czas nauki i superwizji" dane={DANE_WYKRESU} jednostka="godz." zakres="kwiecień–wrzesień 2026" />
      </div>
      <div data-style-id="o13-timechart-pusty">
        <TimeChart tytul="Czas nauki i superwizji" dane={[]} jednostka="godz." zakres="styczeń–marzec 2026" />
      </div>
      <div data-style-id="o13-timechart-ladowanie">
        <TimeChart tytul="Czas nauki i superwizji" dane={[]} jednostka="godz." zakres="kwiecień–wrzesień 2026" stan={LADOWANIE} />
      </div>
      <div data-style-id="o13-timechart-blad">
        <TimeChart tytul="Czas nauki i superwizji" dane={[]} jednostka="godz." zakres="kwiecień–wrzesień 2026" stan={BLAD} />
      </div>

      {/* O12 CourseTree — rozwinięty z działającym przenoszeniem, zwinięty temat,
          niezapisane zmiany, lekcja
          rozwinięta do edycji (przycisk „Edytuj” i treść pod wierszem), pusty,
          ładowanie, błąd */}
      <div data-style-id="o12-coursetree-rozwiniete">
        <DrzewoDemo />
      </div>
      <div data-style-id="o12-coursetree-zwiniety">
        <CourseTree {...AKCJE_CT} tematy={TEMATY_CT} liczbaZmian={0} poczatkowoZwiniete={["temat-2"]} />
      </div>
      <div data-style-id="o12-coursetree-zmieniony">
        <CourseTree {...AKCJE_CT} tematy={TEMATY_ZMIENIONE} liczbaZmian={2} />
      </div>
      <div data-style-id="o12-coursetree-edycja-lekcji">
        <CourseTree
          {...AKCJE_CT}
          tematy={TEMATY_CT}
          liczbaZmian={0}
          onEdytujLekcje={nic}
          rozwiniecie={{
            lekcjaId: "l1",
            tresc: <p>Tu wywołujący rysuje formularz edycji lekcji — pod wierszem, na całą jego szerokość.</p>,
          }}
        />
      </div>
      <div data-style-id="o12-coursetree-pusty">
        <CourseTree {...AKCJE_CT} tematy={[]} liczbaZmian={0} />
      </div>
      <div data-style-id="o12-coursetree-ladowanie">
        <CourseTree {...AKCJE_CT} tematy={[]} liczbaZmian={0} stan={LADOWANIE} />
      </div>
      <div data-style-id="o12-coursetree-blad">
        <CourseTree {...AKCJE_CT} tematy={[]} liczbaZmian={0} stan={BLAD} />
      </div>

      {/* O6 LessonPlayer — warunek niespełniony, czas spełniony z innym brakiem,
          warunek spełniony, bez nagrania, pusty, ładowanie, błąd */}
      <div data-style-id="o6-lessonplayer-niespelniony">
        <LessonPlayer
          {...WSPOLNE_LP}
          id="lekcja-niespelniony"
          krokiZrobione={2}
          pytania={[
            {
              id: "p1",
              stan: "czeka",
              pytanie: "Czy termin superwizji można przesunąć?",
              obiecanyCzas: "jutra",
              poPrzekroczeniu: "Zobaczysz przypomnienie w dzienniku.",
            },
          ]}
          obejrzaneSekundy={480}
          procentAktywnegoCzasu={40}
          braki={[{ id: "b1", tekst: "Obejrzyj jeszcze 8 minut nagrania", href: "#lekcja-niespelniony-tresc" }]}
        />
      </div>
      <div data-style-id="o6-lessonplayer-czas-spelniony-braki">
        <LessonPlayer
          {...WSPOLNE_LP}
          id="lekcja-czas-spelniony"
          krokiZrobione={2}
          pytania={[]}
          obejrzaneSekundy={900}
          procentAktywnegoCzasu={70}
          braki={[{ id: "b2", tekst: "Pobierz i przeczytaj kartę pracy", href: "#lekcja-czas-spelniony-tresc" }]}
        />
      </div>
      <div data-style-id="o6-lessonplayer-spelniony">
        <LessonPlayer
          {...WSPOLNE_LP}
          id="lekcja-spelniony"
          krokiZrobione={3}
          pytania={[
            {
              id: "p2",
              stan: "odpowiedziana",
              pytanie: "Ile trwa superwizja?",
              kto: "Prowadząca",
              kiedy: "wczoraj",
              odpowiedz: "90 minut, raz w miesiącu.",
            },
          ]}
          obejrzaneSekundy={1200}
          procentAktywnegoCzasu={70}
          braki={[]}
        />
      </div>
      <div data-style-id="o6-lessonplayer-bez-nagrania">
        <LessonPlayer
          {...WSPOLNE_LP}
          id="lekcja-bez-nagrania"
          tytul="Materiały do samodzielnej pracy"
          tresc="Ta lekcja nie ma nagrania — przeczytaj materiał i wykonaj zadanie."
          krokiZrobione={4}
          materialy={[{ id: "m2", nazwa: "Zadanie.pdf", href: "#" }]}
          pytania={[]}
          czasTrwaniaSekund={0}
          obejrzaneSekundy={0}
          procentAktywnegoCzasu={60}
          braki={[]}
          bezNagrania
        />
      </div>
      <div data-style-id="o6-lessonplayer-pusty">
        <LessonPlayer
          {...WSPOLNE_LP}
          id="lekcja-pusty"
          tresc=""
          krokiZrobione={4}
          materialy={[]}
          pytania={[]}
          czasTrwaniaSekund={0}
          obejrzaneSekundy={0}
          procentAktywnegoCzasu={0}
          braki={[]}
          bezNagrania
        />
      </div>
      <div data-style-id="o6-lessonplayer-ladowanie">
        <LessonPlayer {...WSPOLNE_LP} krokiZrobione={0} pytania={[]} obejrzaneSekundy={0} procentAktywnegoCzasu={0} braki={[]} stan={LADOWANIE} />
      </div>
      <div data-style-id="o6-lessonplayer-blad">
        <LessonPlayer {...WSPOLNE_LP} krokiZrobione={0} pytania={[]} obejrzaneSekundy={0} procentAktywnegoCzasu={0} braki={[]} stan={BLAD} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Poligon />);
