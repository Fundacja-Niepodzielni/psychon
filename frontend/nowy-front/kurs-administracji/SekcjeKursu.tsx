"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdminCourse } from "@/lib/h08/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { usunMaterial, wgrajMaterialKursu, type MaterialAdmin } from "@/nowy-front/lekcja-edycja/dane";
import { useWgrywanieMaterialow } from "@/nowy-front/lekcja-edycja/materialy";
import {
  imieNazwisko,
  odlaczProwadzacego,
  pobierzProwadzacych,
  pobierzPrzypisania,
  pobierzTestKursu,
  przypiszProwadzacego,
  zdanieBledu,
  type Prowadzacy,
  type PrzypisanieKursu,
} from "./dane";
import style from "./KursAdministracji.module.css";

/**
 * Materiały całego kursu, bez lekcji. Wgrywanie idzie tą samą logiką co
 * materiały lekcji (`useWgrywanieMaterialow`), inną trasą. Serwer nie ma
 * odczytu listy materiałów kursu dla administracji, więc sekcja pokazuje
 * liczbę materiałów z kursu i — do usunięcia — pliki wgrane na tym ekranie.
 *
 * Pole pliku jest tu natywne i podpisane etykietą: obszar upuszczania z
 * systemu wzorców trzyma pole bez etykiety wewnątrz elementu o roli przycisku,
 * czego czytnik ekranu nie nazwie.
 */
export function MaterialyKursu({ kurs }: { kurs: AdminCourse }) {
  const baza = useId();
  const [liczba, setLiczba] = useState(kurs.materials_count);
  const [doUsuniecia, setDoUsuniecia] = useState<MaterialAdmin | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const materialy = useWgrywanieMaterialow(
    (plik) => wgrajMaterialKursu(kurs.id, plik),
    () => setLiczba((poprzednia) => poprzednia + 1),
  );

  async function usun(material: MaterialAdmin) {
    setDoUsuniecia(null);
    setBlad(null);
    try {
      await usunMaterial(material.id);
      materialy.zdejmij(material);
      setLiczba((poprzednia) => Math.max(0, poprzednia - 1));
    } catch (wyjatek) {
      setBlad(zdanieBledu(wyjatek, "Nie udało się usunąć materiału. Spróbuj ponownie."));
    }
  }

  return (
    <section id="materialy" className={style.blok} aria-labelledby={`${baza}-tytul`}>
      <Heading stopien={2} id={`${baza}-tytul`}>
        Materiały kursu
      </Heading>
      <Text>{`Materiały całego kursu, bez lekcji: ${liczba}. Materiały lekcji dodasz na ekranie lekcji.`}</Text>
      {blad && (
        <Notice wariant="error" tytul="Materiał nie został usunięty">
          {blad}
        </Notice>
      )}
      <div className={style.polePliku}>
        <label htmlFor={`${baza}-plik`} className={style.etykietaPliku}>
          Dodaj materiały kursu z dysku
        </label>
        <input
          id={`${baza}-plik`}
          type="file"
          multiple
          className={style.wejsciePliku}
          aria-describedby={`${baza}-plik-podpowiedz`}
          onChange={(zdarzenie) => {
            const lista = zdarzenie.target.files;
            if (lista && lista.length > 0) void materialy.dodaj(lista);
            zdarzenie.target.value = "";
          }}
        />
        <Hint id={`${baza}-plik-podpowiedz`}>
          Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Plik może mieć najwyżej 10 MB.
        </Hint>
      </div>
      {materialy.pliki.length > 0 && (
        <ul className={style.lista} aria-label="Stan wgrywania">
          {materialy.pliki.map((plik) => (
            <li key={plik.nazwa} className={style.wiersz} data-stan={plik.stan}>
              <span className={style.nazwa}>{plik.nazwa}</span>
              <Hint>{plik.komunikat}</Hint>
            </li>
          ))}
        </ul>
      )}
      {materialy.wgrane.length > 0 && (
        <ul className={style.lista} aria-label="Materiały wgrane teraz">
          {materialy.wgrane.map((material) => (
            <li key={material.id} className={style.wiersz}>
              <span className={style.nazwa}>{material.name}</span>
              <Button
                poziom="quiet"
                niebezpieczny
                aria-label={`Usuń materiał „${material.name}”`}
                onClick={() => setDoUsuniecia(material)}
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
      {doUsuniecia && (
        <Dialog
          tytul={`Usunąć materiał „${doUsuniecia.name}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń materiał"
          onWycofaj={() => setDoUsuniecia(null)}
          onPotwierdz={() => void usun(doUsuniecia)}
        >
          <Text>Pliku nie da się przywrócić.</Text>
        </Dialog>
      )}
    </section>
  );
}

type StanPrzypisan =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; tresc: string }
  | { rodzaj: "dane"; przypisania: PrzypisanieKursu[]; prowadzacy: Prowadzacy[] };

const ZAKRES_KURSU = "kurs";

interface WlasciwosciPrzypisan {
  kurs: AdminCourse;
  lekcje: { id: number; title: string }[];
}

/**
 * Prowadzący kursu: kto prowadzi cały kurs i kto pojedyncze lekcje. Lekcja bez
 * własnego prowadzącego ma prowadzącego całego kursu — sekcja mówi to wprost.
 */
export function PrzypisaniaKursu({ kurs, lekcje }: WlasciwosciPrzypisan) {
  const baza = useId();
  const [stan, setStan] = useState<StanPrzypisan>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [wybrany, setWybrany] = useState("");
  const [zakres, setZakres] = useState(ZAKRES_KURSU);
  const [bladPola, setBladPola] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [doOdlaczenia, setDoOdlaczenia] = useState<{ przypisanie: PrzypisanieKursu; zakres: string } | null>(null);
  // Przypisanie w toku: drugie kliknięcie przed odpowiedzią serwera nie wysyła
  // drugiego żądania (ref — od razu), a przycisk jest na ten czas wyłączony (stan).
  const przypisywanie = useRef(false);
  const [przypisywanieTrwa, setPrzypisywanieTrwa] = useState(false);
  const odlaczane = useRef(new Set<number>());

  useEffect(() => {
    let aktualne = true;
    Promise.all([pobierzPrzypisania(kurs.id), pobierzProwadzacych()])
      .then(([przypisania, prowadzacy]) => {
        if (aktualne) setStan({ rodzaj: "dane", przypisania, prowadzacy });
      })
      .catch((wyjatek: unknown) => {
        if (aktualne) {
          setStan({ rodzaj: "blad", tresc: zdanieBledu(wyjatek, "Nie udało się wczytać przypisań prowadzących.") });
        }
      });
    return () => {
      aktualne = false;
    };
  }, [kurs.id, proba]);

  const naglowek = (
    <Heading stopien={2} id={`${baza}-tytul`}>
      Prowadzący kursu
    </Heading>
  );

  if (stan.rodzaj === "ladowanie") {
    return (
      <section id="prowadzacy" className={style.blok} aria-labelledby={`${baza}-tytul`} aria-busy="true">
        {naglowek}
        <Skeleton wiersze={3} />
      </section>
    );
  }
  if (stan.rodzaj === "blad") {
    return (
      <section id="prowadzacy" className={style.blok} aria-labelledby={`${baza}-tytul`}>
        {naglowek}
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać prowadzących"
          akcja={
            <Button
              poziom="outline"
              onClick={() => {
                setStan({ rodzaj: "ladowanie" });
                setProba((poprzednia) => poprzednia + 1);
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.tresc}
        </Notice>
      </section>
    );
  }

  const { przypisania, prowadzacy } = stan;
  const kursu = przypisania.find((przypisanie) => przypisanie.lesson_id === null) ?? null;
  const wiersze = [
    { klucz: ZAKRES_KURSU, zakres: "Cały kurs", wlasne: kursu, odziedziczone: null as PrzypisanieKursu | null },
    ...lekcje.map((lekcja) => {
      const wlasne = przypisania.find((przypisanie) => przypisanie.lesson_id === lekcja.id) ?? null;
      return { klucz: String(lekcja.id), zakres: lekcja.title, wlasne, odziedziczone: wlasne ? null : kursu };
    }),
  ];

  async function przypisz() {
    if (stan.rodzaj !== "dane") return;
    if (wybrany === "") {
      setBladPola("Wybierz prowadzącego do przypisania.");
      return;
    }
    if (przypisywanie.current) return;
    przypisywanie.current = true;
    setPrzypisywanieTrwa(true);
    setBladPola(null);
    setBlad(null);
    try {
      const nowe = await przypiszProwadzacego(kurs.id, Number(wybrany), zakres === ZAKRES_KURSU ? null : Number(zakres));
      // Od stanu bieżącego, nie z chwili kliknięcia: odpowiedź nie zdejmuje
      // skutku innej czynności, która skończyła się w międzyczasie.
      setStan((poprzedni) =>
        poprzedni.rodzaj === "dane" ? { ...poprzedni, przypisania: [...poprzedni.przypisania, nowe] } : poprzedni,
      );
      setWybrany("");
    } catch (wyjatek) {
      setBlad(zdanieBledu(wyjatek, "Nie udało się przypisać prowadzącego. Spróbuj ponownie."));
    } finally {
      przypisywanie.current = false;
      setPrzypisywanieTrwa(false);
    }
  }

  async function odlacz(przypisanie: PrzypisanieKursu) {
    if (stan.rodzaj !== "dane") return;
    setDoOdlaczenia(null);
    if (odlaczane.current.has(przypisanie.id)) return;
    odlaczane.current.add(przypisanie.id);
    setBlad(null);
    try {
      await odlaczProwadzacego(kurs.id, przypisanie.id);
      setStan((poprzedni) =>
        poprzedni.rodzaj === "dane"
          ? { ...poprzedni, przypisania: poprzedni.przypisania.filter((wpis) => wpis.id !== przypisanie.id) }
          : poprzedni,
      );
    } catch (wyjatek) {
      setBlad(zdanieBledu(wyjatek, "Nie udało się odłączyć prowadzącego. Spróbuj ponownie."));
    } finally {
      odlaczane.current.delete(przypisanie.id);
    }
  }

  return (
    <section id="prowadzacy" className={style.blok} aria-labelledby={`${baza}-tytul`}>
      {naglowek}
      {blad && (
        <Notice wariant="error" tytul="Zmiana nie została zapisana">
          {blad}
        </Notice>
      )}
      <ul className={style.lista}>
        {wiersze.map((wiersz) => (
          <li key={wiersz.klucz} className={style.wiersz}>
            <span className={style.nazwa}>
              {wiersz.zakres}
              {": "}
              {wiersz.wlasne
                ? imieNazwisko(wiersz.wlasne.instructor)
                : wiersz.odziedziczone
                  ? `${imieNazwisko(wiersz.odziedziczone.instructor)} (prowadzący całego kursu)`
                  : "brak prowadzącego"}
            </span>
            {wiersz.wlasne && (
              <Button
                poziom="quiet"
                niebezpieczny
                aria-label={`Odłącz: ${imieNazwisko(wiersz.wlasne.instructor)}, ${wiersz.zakres}`}
                onClick={() =>
                  wiersz.wlasne && setDoOdlaczenia({ przypisanie: wiersz.wlasne, zakres: wiersz.zakres })
                }
              >
                Odłącz
              </Button>
            )}
          </li>
        ))}
      </ul>
      {prowadzacy.length === 0 ? (
        <Text>W katalogu nie ma jeszcze żadnego prowadzącego.</Text>
      ) : (
        <div className={style.formularz}>
          <Field
            id={`${baza}-osoba`}
            etykieta="Prowadzący"
            rodzaj="wybor"
            opcje={[
              { wartosc: "", etykieta: "Wybierz prowadzącego" },
              ...prowadzacy.map((osoba) => ({ wartosc: String(osoba.id), etykieta: imieNazwisko(osoba) })),
            ]}
            wartosc={wybrany}
            onZmiana={setWybrany}
            blad={bladPola ?? undefined}
          />
          <Field
            id={`${baza}-zakres`}
            etykieta="Zakres"
            rodzaj="wybor"
            opcje={[
              { wartosc: ZAKRES_KURSU, etykieta: "Cały kurs" },
              ...lekcje.map((lekcja) => ({ wartosc: String(lekcja.id), etykieta: lekcja.title })),
            ]}
            wartosc={zakres}
            onZmiana={setZakres}
          />
          <div>
            <Button poziom="outline" disabled={przypisywanieTrwa} onClick={() => void przypisz()}>
              Przypisz prowadzącego
            </Button>
          </div>
        </div>
      )}
      {doOdlaczenia && (
        <Dialog
          tytul={`Odłączyć: ${imieNazwisko(doOdlaczenia.przypisanie.instructor)}?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Odłącz prowadzącego"
          onWycofaj={() => setDoOdlaczenia(null)}
          onPotwierdz={() => void odlacz(doOdlaczenia.przypisanie)}
        >
          <Text>{`Zakres: ${doOdlaczenia.zakres}. Przypisanie zniknie z tego kursu.`}</Text>
        </Dialog>
      )}
    </section>
  );
}

type StanTestu = { rodzaj: "ladowanie" } | { rodzaj: "blad" } | { rodzaj: "dane"; idTestu: number | null };

/**
 * Wejście do banku pytań testu kursu. Odnośnik pojawia się wyłącznie wtedy,
 * gdy serwer poda test kursu — adres banku pytań niesie identyfikator testu,
 * nie kursu, więc bez odpowiedzi serwera odnośnika nie ma.
 */
export function BankPytanKursu({ kurs }: { kurs: AdminCourse }) {
  const baza = useId();
  const [stan, setStan] = useState<StanTestu>({ rodzaj: "ladowanie" });

  useEffect(() => {
    let aktualne = true;
    pobierzTestKursu(kurs.id)
      .then((test) => {
        // Odnośnik powstaje tylko z liczbowego identyfikatoru testu z odpowiedzi serwera.
        const idTestu = typeof test?.id === "number" ? test.id : null;
        if (aktualne) setStan({ rodzaj: "dane", idTestu });
      })
      .catch(() => {
        if (aktualne) setStan({ rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [kurs.id]);

  return (
    <section
      id="test"
      className={style.blok}
      aria-labelledby={`${baza}-tytul`}
      aria-busy={stan.rodzaj === "ladowanie" ? "true" : undefined}
    >
      <Heading stopien={2} id={`${baza}-tytul`}>
        Test wiedzy
      </Heading>
      {stan.rodzaj === "ladowanie" && <Skeleton wiersze={1} />}
      {stan.rodzaj === "blad" && <Text>Nie udało się sprawdzić, czy kurs ma test wiedzy. Odśwież stronę.</Text>}
      {stan.rodzaj === "dane" && stan.idTestu === null && <Text>Ten kurs nie ma jeszcze testu wiedzy.</Text>}
      {stan.rodzaj === "dane" && stan.idTestu !== null && (
        <>
          <Text>
            Pytania i odpowiedzi testu kończącego ten kurs. Edycja nie zmienia wyników wcześniejszych podejść.
          </Text>
          <Text>
            <Link href={`/admin/testy/${stan.idTestu}/pytania`}>Otwórz bank pytań</Link>
          </Text>
        </>
      )}
    </section>
  );
}
