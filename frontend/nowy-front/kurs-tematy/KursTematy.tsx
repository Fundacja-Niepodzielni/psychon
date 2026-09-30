"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
import { ApiError } from "@/lib/api/klient";
import {
  dodajTemat,
  pobierzTematy,
  usunTemat,
  zapiszUkladTematow,
  zdanieBleduTematow,
  zmienTytulTematu as zmienTytulTematuApi,
  type GrupaTras,
} from "@/lib/api/h08-tematy";
import { updateInstructorCourse, updateInstructorLesson } from "@/lib/api/prowadzacy-kursy";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { CourseTree } from "@/design-system/organizmy/CourseTree/CourseTree";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import type { StanDanych } from "@/design-system/organizmy/stanDanych";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { checklistaPublikacji, type WynikDanychKursu } from "@/nowy-front/kurs-publikacja/dane";
import {
  cialoUkladu,
  dopiszTemat,
  kolejnoscZmieniona,
  przeniesLekcje,
  tematyDrzewa,
  tytulyDoZapisu,
  ukladZSerwera,
  usunTematZUkladu,
  zmienTytulLekcji,
  zmienTytulTematu,
  type TematUkladu,
  type Uklad,
} from "./uklad";
import style from "./KursTematy.module.css";

/**
 * Grupa tras tematów tego ekranu. Dane kursu czyta `pobierzDaneKursu`
 * (`nowy-front/kurs-publikacja/dane.ts`) tokenem prowadzącego z tras
 * `/instructor/…`, więc tematy i dane kursu zapisują się tą samą grupą —
 * token administracji dostałby tu 403 już przy odczycie kursu.
 */
const GRUPA: GrupaTras = "instructor";

const OKRUSZKI = [{ etykieta: "Kursy" }, { etykieta: "Tematy i lekcje" }];

interface WlasciwosciKursTematy {
  idKursu: string;
  wynik: WynikDanychKursu;
}

/**
 * Ekran A-12 „Kurs: tematy i lekcje” na szablonie `DetailTemplate`: nagłówek
 * z akcją główną „Opublikuj kurs”, panel braków O7 (`checklist` szablonu),
 * drzewo tematów i lekcji O12 w kolumnie głównej, dane kursu O11 w kolumnie
 * wspierającej. Każdy stan (sukces, ładowanie, błąd, brak uprawnień, pusty)
 * renderuje się WEWNĄTRZ szablonu — korzeń szablonu jest jedynym `main`.
 */
export function KursTematy({ idKursu, wynik }: WlasciwosciKursTematy) {
  const router = useRouter();
  const wroc = () => router.back();

  if (wynik.status === "brak-sesji" || wynik.status === "brak-uprawnien") {
    return <BrakUprawnien idKursu={idKursu} wroc={wroc} />;
  }
  if (wynik.status === "blad") {
    return (
      <DetailTemplate
        naglowek={{ okruszki: OKRUSZKI, tytul: `Kurs ${idKursu}`, onPowrot: wroc }}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać kursu"
            akcja={
              <Button poziom="outline" onClick={() => router.refresh()}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Treść kursu nie jest zmyślana bez danych.
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }
  return (
    <EdytorTematow
      kursPoczatkowy={wynik.dane.kurs}
      lekcje={wynik.dane.lekcje}
      wroc={wroc}
      przejdz={(adres) => router.push(adres)}
    />
  );
}

function BrakUprawnien({ idKursu, wroc }: { idKursu: string; wroc: () => void }) {
  return (
    <DetailTemplate
      naglowek={{ okruszki: OKRUSZKI, tytul: `Kurs ${idKursu}`, onPowrot: wroc }}
      glowna={
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Tematy kursu dla prowadzących"
          rola="prowadzących"
          przycisk={{ etykieta: "Wróć", onClick: wroc }}
        />
      }
      wspierajaca={null}
    />
  );
}

type StanTematow =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; tresc: string }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "gotowy"; serwer: Uklad; lokalny: Uklad; historia: Uklad[]; ostatniTytul: number | null };

type StanDialogu =
  | { rodzaj: "dodaj" }
  | { rodzaj: "zmien"; temat: TematUkladu }
  | { rodzaj: "usun"; temat: TematUkladu }
  | { rodzaj: "porzuc" }
  | { rodzaj: "wyjscie"; dokad: () => void };

interface WlasciwosciEdytora {
  kursPoczatkowy: AdminCourse;
  lekcje: AdminLesson[];
  wroc: () => void;
  przejdz: (adres: string) => void;
}

function EdytorTematow({ kursPoczatkowy, lekcje, wroc, przejdz }: WlasciwosciEdytora) {
  const baza = useId();
  const idPrzyciskuPublikacji = `${baza}-opublikuj`;
  const [kurs, setKurs] = useState(kursPoczatkowy);
  const [stan, setStan] = useState<StanTematow>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [bladTresci, setBladTresci] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [checklistaOtwarta, setChecklistaOtwarta] = useState(false);
  const [gotowyDoPublikacji, setGotowyDoPublikacji] = useState(false);
  const [dialog, setDialog] = useState<StanDialogu | null>(null);
  const [poleDialogu, setPoleDialogu] = useState("");
  const [bladDialogu, setBladDialogu] = useState<string | null>(null);
  const [formularz, setFormularz] = useState<{ tytul: string; opis: string } | null>(null);
  const [bledyFormularza, setBledyFormularza] = useState<{ tytul?: string; opis?: string; ogolny?: string }>({});

  useEffect(() => {
    let aktualne = true;
    pobierzTematy(GRUPA, kursPoczatkowy.id)
      .then((tematy) => {
        if (!aktualne) return;
        const serwer = ukladZSerwera(tematy, lekcje);
        setStan({ rodzaj: "gotowy", serwer, lokalny: serwer, historia: [], ostatniTytul: null });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        if (blad instanceof ApiError && (blad.status === 401 || blad.status === 403 || blad.status === 404)) {
          setStan({ rodzaj: "brak-uprawnien" });
          return;
        }
        setStan({ rodzaj: "blad", tresc: zdanieBleduTematow(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [kursPoczatkowy.id, lekcje, proba]);

  const liczbaZmian = stan.rodzaj === "gotowy" ? stan.historia.length : 0;

  // Wyjście z niezapisanymi zmianami pyta (M13) — także zamknięcie karty.
  useEffect(() => {
    if (liczbaZmian === 0) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [liczbaZmian]);

  const zamknijChecklist = useCallback(() => {
    setChecklistaOtwarta(false);
    document.getElementById(idPrzyciskuPublikacji)?.focus();
  }, [idPrzyciskuPublikacji]);

  if (stan.rodzaj === "brak-uprawnien") {
    return <BrakUprawnien idKursu={String(kursPoczatkowy.id)} wroc={wroc} />;
  }

  const { braki, gotowe } = checklistaPublikacji({ kurs, lekcje });

  function wyjdz(dokad: () => void) {
    if (liczbaZmian > 0) {
      setDialog({ rodzaj: "wyjscie", dokad });
      return;
    }
    dokad();
  }

  function opublikuj() {
    // Prowadzący nie publikuje kursu: `PATCH /instructor/courses/{course}`
    // zapisuje wyłącznie `title` i `description`
    // (`InstructorCourseController::EDITABLE_FIELDS`), publikacja zostaje
    // przy administracji. Przycisk otwiera więc panel braków O7 i nie woła
    // żadnej trasy zapisu — ta sama ścieżka, którą miała trasa dotąd.
    if (braki.length === 0) {
      setGotowyDoPublikacji(true);
      return;
    }
    setGotowyDoPublikacji(false);
    setChecklistaOtwarta(true);
  }

  function zmien(nastepny: (lokalny: Uklad) => Uklad, tytulLekcji: number | null = null) {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy") return poprzedni;
      const lokalny = nastepny(poprzedni.lokalny);
      if (lokalny === poprzedni.lokalny) return poprzedni;
      // Kolejne litery tytułu tej samej lekcji są jedną zmianą, nie n zmianami.
      const scal = tytulLekcji !== null && poprzedni.ostatniTytul === tytulLekcji;
      return {
        ...poprzedni,
        lokalny,
        historia: scal ? poprzedni.historia : [...poprzedni.historia, poprzedni.lokalny],
        ostatniTytul: tytulLekcji,
      };
    });
  }

  function cofnij() {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy" || poprzedni.historia.length === 0) return poprzedni;
      const historia = poprzedni.historia.slice(0, -1);
      return { ...poprzedni, lokalny: poprzedni.historia[poprzedni.historia.length - 1], historia, ostatniTytul: null };
    });
  }

  function porzucWszystko() {
    setStan((poprzedni) =>
      poprzedni.rodzaj === "gotowy"
        ? { ...poprzedni, lokalny: poprzedni.serwer, historia: [], ostatniTytul: null }
        : poprzedni,
    );
    setBladTresci(null);
  }

  async function zapisz() {
    if (stan.rodzaj !== "gotowy" || zapisywanie) return;
    const { serwer, lokalny } = stan;
    setZapisywanie(true);
    setBladTresci(null);
    try {
      let potwierdzony = serwer;
      if (kolejnoscZmieniona(serwer, lokalny)) {
        const tematy = await zapiszUkladTematow(GRUPA, kurs.id, cialoUkladu(lokalny));
        potwierdzony = { ...ukladZSerwera(tematy, lekcje), tytulyLekcji: serwer.tytulyLekcji };
      }
      for (const { id, title } of tytulyDoZapisu(serwer, lokalny)) {
        const lekcja = await updateInstructorLesson(id, { title });
        potwierdzony = zmienTytulLekcji(potwierdzony, id, lekcja.title);
      }
      setStan({ rodzaj: "gotowy", serwer: potwierdzony, lokalny: potwierdzony, historia: [], ostatniTytul: null });
    } catch (blad) {
      // Stan lokalny zostaje nietknięty — osoba poprawia i zapisuje ponownie.
      setBladTresci(zdanieBleduTematow(blad));
    } finally {
      setZapisywanie(false);
    }
  }

  function otworzDialog(nowy: StanDialogu, wartosc = "") {
    setPoleDialogu(wartosc);
    setBladDialogu(null);
    setDialog(nowy);
  }

  async function potwierdzDialog() {
    if (!dialog) return;
    if (dialog.rodzaj === "porzuc") {
      porzucWszystko();
      setDialog(null);
      return;
    }
    if (dialog.rodzaj === "wyjscie") {
      setDialog(null);
      dialog.dokad();
      return;
    }
    if (dialog.rodzaj === "usun") {
      const { temat } = dialog;
      setDialog(null);
      try {
        await usunTemat(GRUPA, temat.id);
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: usunTematZUkladu(poprzedni.serwer, temat.id),
                lokalny: usunTematZUkladu(poprzedni.lokalny, temat.id),
                historia: poprzedni.historia.map((wpis) => usunTematZUkladu(wpis, temat.id)),
              }
            : poprzedni,
        );
        setBladTresci(null);
      } catch (blad) {
        // 422 `conditions_not_met`: temat ma lekcje — drzewo bez zmian, jedno zdanie.
        setBladTresci(zdanieBleduTematow(blad));
      }
      return;
    }
    const tytul = poleDialogu.trim();
    if (tytul === "") {
      setBladDialogu("Podaj nazwę tematu.");
      return;
    }
    try {
      if (dialog.rodzaj === "dodaj") {
        const temat = await dodajTemat(GRUPA, kurs.id, tytul);
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: dopiszTemat(poprzedni.serwer, temat),
                lokalny: dopiszTemat(poprzedni.lokalny, temat),
                historia: poprzedni.historia.map((wpis) => dopiszTemat(wpis, temat)),
              }
            : poprzedni,
        );
      } else {
        const temat = await zmienTytulTematuApi(GRUPA, dialog.temat.id, tytul);
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: zmienTytulTematu(poprzedni.serwer, temat.id, temat.title),
                lokalny: zmienTytulTematu(poprzedni.lokalny, temat.id, temat.title),
                historia: poprzedni.historia.map((wpis) => zmienTytulTematu(wpis, temat.id, temat.title)),
              }
            : poprzedni,
        );
      }
      setDialog(null);
    } catch (blad) {
      setBladDialogu(zdanieBleduTematow(blad));
    }
  }

  async function zapiszDaneKursu() {
    if (!formularz) return;
    const tytul = formularz.tytul.trim();
    if (tytul === "") {
      setBledyFormularza({ tytul: "Podaj tytuł kursu." });
      return;
    }
    try {
      const zapisany = await updateInstructorCourse(kurs.id, {
        title: tytul,
        description: formularz.opis.trim() === "" ? null : formularz.opis,
      });
      setKurs(zapisany);
      setFormularz(null);
      setBledyFormularza({});
    } catch (blad) {
      if (blad instanceof ApiError && blad.code === "validation_failed") {
        setBledyFormularza({ tytul: blad.errors?.title?.[0], opis: blad.errors?.description?.[0] });
        return;
      }
      setBledyFormularza({ ogolny: zdanieBleduTematow(blad) });
    }
  }

  const stanDrzewa: StanDanych =
    stan.rodzaj === "ladowanie"
      ? { rodzaj: "ladowanie" }
      : stan.rodzaj === "blad"
        ? {
            rodzaj: "blad",
            tresc: stan.tresc,
            onPonow: () => {
              setStan({ rodzaj: "ladowanie" });
              setProba((p) => p + 1);
            },
          }
        : { rodzaj: "gotowy" };

  const tematy = stan.rodzaj === "gotowy" ? tematyDrzewa(stan.serwer, stan.lokalny, lekcje) : [];
  const tematyUkladu = stan.rodzaj === "gotowy" ? stan.lokalny.tematy : [];

  const glowna = (
    <div id="lekcje" className={style.sekcja}>
      {bladTresci && (
        <Notice wariant="error" tytul="Zmiana nie została zapisana">
          {bladTresci}
        </Notice>
      )}
      {gotowyDoPublikacji && (
        <Notice wariant="ok" tytul="Kurs nie ma braków">
          Wszystkie pozycje listy są gotowe. Publikację kursu zatwierdza administracja.
        </Notice>
      )}
      <CourseTree
        tematy={tematy}
        liczbaZmian={liczbaZmian}
        stan={stanDrzewa}
        onPrzenies={(zTematu, lekcja, doTematu, indeks) =>
          zmien((lokalny) => przeniesLekcje(lokalny, Number(zTematu), Number(lekcja), Number(doTematu), indeks))
        }
        // Lekcję zakłada istniejący edytor treści prowadzącego; bez `topic_id`
        // trafia na koniec ostatniego tematu (aneks kontraktu, pkt 3).
        onDodajLekcje={() => wyjdz(() => przejdz(`/prowadzacy/kursy/${kurs.id}`))}
        onZmienTytulLekcji={(_temat, lekcja, tytul) =>
          zmien((lokalny) => zmienTytulLekcji(lokalny, Number(lekcja), tytul), Number(lekcja))
        }
        onZapisz={() => void zapisz()}
        onCofnij={cofnij}
        onPorzucWszystko={() => otworzDialog({ rodzaj: "porzuc" })}
        pusty={{
          naglowek: "Kurs nie ma jeszcze tematów",
          tresc: "Tematy porządkują lekcje kursu. Zacznij od pierwszego tematu, potem dodasz do niego lekcje.",
          przycisk: { etykieta: "Dodaj pierwszy temat", onClick: () => otworzDialog({ rodzaj: "dodaj" }) },
        }}
      />
    </div>
  );

  const wspierajaca = (
    <div className={style.kolumna}>
      {tematyUkladu.length > 0 && (
        <section className={style.sekcja} aria-labelledby={`${baza}-tematy`}>
          <Heading stopien={2} id={`${baza}-tematy`}>
            Tematy kursu
          </Heading>
          <ul className={style.listaTematow}>
            {tematyUkladu.map((temat) => (
              <li key={temat.id} className={style.wierszTematu}>
                <span className={style.tytulTematu}>{temat.tytul}</span>
                <Button
                  poziom="quiet"
                  aria-label={`Zmień nazwę tematu „${temat.tytul}”`}
                  onClick={() => otworzDialog({ rodzaj: "zmien", temat }, temat.tytul)}
                >
                  Zmień nazwę
                </Button>
                <Button
                  poziom="quiet"
                  niebezpieczny
                  aria-label={`Usuń temat „${temat.tytul}”`}
                  onClick={() => otworzDialog({ rodzaj: "usun", temat })}
                >
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button poziom="outline" onClick={() => otworzDialog({ rodzaj: "dodaj" })}>
              Dodaj temat
            </Button>
          </div>
        </section>
      )}

      <section id="opis" className={style.sekcja} aria-labelledby={`${baza}-dane`}>
        {formularz ? (
          <>
            {bledyFormularza.ogolny && (
              <Notice wariant="error" tytul="Dane kursu nie zostały zapisane">
                {bledyFormularza.ogolny}
              </Notice>
            )}
            <FormSection
              tytul="Dane kursu"
              pola={[
                {
                  id: `${baza}-tytul`,
                  etykieta: "Tytuł kursu",
                  rodzaj: "tekst",
                  wymagane: true,
                  wartosc: formularz.tytul,
                  onZmiana: (tytul) => setFormularz({ ...formularz, tytul }),
                  blad: bledyFormularza.tytul,
                },
                {
                  id: `${baza}-opis`,
                  etykieta: "Opis kursu",
                  rodzaj: "wieloliniowy",
                  wartosc: formularz.opis,
                  onZmiana: (opis) => setFormularz({ ...formularz, opis }),
                  blad: bledyFormularza.opis,
                },
              ]}
              onAnuluj={() => {
                setFormularz(null);
                setBledyFormularza({});
              }}
              onZapisz={() => void zapiszDaneKursu()}
            />
          </>
        ) : (
          <>
            <Heading stopien={2} id={`${baza}-dane`}>
              Dane kursu
            </Heading>
            <Text>{kurs.description && kurs.description.trim() !== "" ? kurs.description : "Kurs bez opisu."}</Text>
            <div>
              <Button
                poziom="quiet"
                onClick={() => setFormularz({ tytul: kurs.title, opis: kurs.description ?? "" })}
              >
                Zmień dane kursu
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );

  return (
    <>
      <DetailTemplate
        naglowek={{
          okruszki: OKRUSZKI,
          tytul: kurs.title,
          status: kurs.is_published
            ? { wariant: "ok", etykieta: "Opublikowany" }
            : { wariant: "neutral", etykieta: "Szkic" },
          onPowrot: () => wyjdz(wroc),
          dzieci: (
            <div>
              <Button id={idPrzyciskuPublikacji} poziom="primary" onClick={opublikuj}>
                Opublikuj kurs
              </Button>
            </div>
          ),
        }}
        checklist={
          checklistaOtwarta
            ? { tytul: "Braki przed publikacją", braki, gotowe, onZamknij: zamknijChecklist }
            : undefined
        }
        glowna={glowna}
        wspierajaca={wspierajaca}
      />
      {dialog && (
        <OknoDialogu
          dialog={dialog}
          idPola={`${baza}-pole-dialogu`}
          wartosc={poleDialogu}
          blad={bladDialogu}
          onZmiana={setPoleDialogu}
          onWycofaj={() => setDialog(null)}
          onPotwierdz={() => void potwierdzDialog()}
        />
      )}
    </>
  );
}

interface WlasciwosciOkna {
  dialog: StanDialogu;
  idPola: string;
  wartosc: string;
  blad: string | null;
  onZmiana: (wartosc: string) => void;
  onWycofaj: () => void;
  onPotwierdz: () => void;
}

function OknoDialogu({ dialog, idPola, wartosc, blad, onZmiana, onWycofaj, onPotwierdz }: WlasciwosciOkna) {
  if (dialog.rodzaj === "dodaj" || dialog.rodzaj === "zmien") {
    return (
      <Dialog
        tytul={dialog.rodzaj === "dodaj" ? "Nowy temat" : "Zmień nazwę tematu"}
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia={dialog.rodzaj === "dodaj" ? "Dodaj temat" : "Zapisz nazwę"}
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Field
          id={idPola}
          etykieta="Nazwa tematu"
          rodzaj="tekst"
          wymagane
          wartosc={wartosc}
          onZmiana={onZmiana}
          blad={blad ?? undefined}
        />
      </Dialog>
    );
  }
  if (dialog.rodzaj === "usun") {
    return (
      <Dialog
        tytul={`Usunąć temat „${dialog.temat.tytul}”?`}
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Usuń temat"
        niebezpieczne
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>Usunąć można tylko temat bez lekcji. Lekcje zostają w kursie.</Text>
      </Dialog>
    );
  }
  if (dialog.rodzaj === "porzuc") {
    return (
      <Dialog
        tytul="Porzucić wszystkie zmiany?"
        etykietaWycofania="Wróć do edycji"
        etykietaPotwierdzenia="Porzuć wszystko"
        niebezpieczne
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>Drzewo wróci do ostatnio zapisanego układu tematów i lekcji.</Text>
      </Dialog>
    );
  }
  return (
    <Dialog
      tytul="Wyjść bez zapisu?"
      etykietaWycofania="Zostań"
      etykietaPotwierdzenia="Wyjdź bez zapisu"
      niebezpieczne
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
    >
      <Text>Niezapisane zmiany w drzewie kursu zostaną utracone.</Text>
    </Dialog>
  );
}
