"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { CollapsibleSection } from "@/design-system/molekuly/CollapsibleSection/CollapsibleSection";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice, type WariantNotice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import {
  PublishChecklist,
  type PozycjaChecklisty,
} from "@/design-system/organizmy/PublishChecklist/PublishChecklist";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  adresKursu,
  czyPoprawnyIdentyfikator,
  pobierzKurs,
  sklasyfikujBlad,
  usunKurs,
  zmienPublikacje,
  type BladOperacji,
  type KursPublikacji,
} from "./dane";
import style from "./PublikacjaKursu.module.css";

type Stan = "ladowanie" | "blad" | "zakazane" | "nie-znaleziono" | "ok" | "usuniety";

interface Komunikat {
  wariant: WariantNotice;
  tytul: string;
  tresc: string;
}

interface WlasciwosciPublikacjaKursu {
  idKursu: string;
}

const ADRES_LISTY_KURSOW = "/admin/kursy";

function komunikatBledu(blad: BladOperacji, tytul: string): Komunikat | null {
  if (blad.rodzaj === "zakazane") {
    return { wariant: "warn", tytul: "Brak uprawnień", tresc: "Ta zmiana wymaga roli opiekuna projektu albo administratora." };
  }
  if (blad.rodzaj === "blad") return { wariant: "error", tytul, tresc: blad.komunikat };
  if (blad.rodzaj === "siec") {
    return {
      wariant: "error",
      tytul,
      tresc: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
    };
  }
  return null;
}

/**
 * Ekran A-14 „Publikacja kursu” (administracja) na szablonie `FormTemplate`.
 * Jedno zadanie: wypuścić kurs. Kurs jest szkicem → `FormSection` z jednym
 * przyciskiem głównym „Opublikuj kurs”. Serwer odrzuca kurs bez lekcji
 * (`422 conditions_not_met`, `reason.missing`) — wtedy stan kursu zostaje
 * bez zmian, a braki pokazuje `PublishChecklist`. Kurs opublikowany ma
 * w pierwszym bloku widoczny, drugorzędny przycisk „Cofnij publikację”.
 * Usunięcie kursu jest rzadkie, więc siedzi w zwiniętej sekcji „Usunięcie
 * kursu” poza pierwszym blokiem, jako przycisk drugorzędny; wymaga
 * potwierdzenia w oknie `Dialog`.
 */
export function PublikacjaKursu({ idKursu }: WlasciwosciPublikacjaKursu) {
  const router = useRouter();
  const poprawnyId = czyPoprawnyIdentyfikator(idKursu);
  const [stan, setStan] = useState<Stan>(poprawnyId ? "ladowanie" : "nie-znaleziono");
  const [kurs, setKurs] = useState<KursPublikacji | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [komunikat, setKomunikat] = useState<Komunikat | null>(null);
  const [braki, setBraki] = useState<PozycjaChecklisty[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [potwierdzenieUsuniecia, setPotwierdzenieUsuniecia] = useState(false);
  const [bladUsuniecia, setBladUsuniecia] = useState<string | null>(null);
  const [proba, setProba] = useState(0);

  useEffect(() => {
    if (!poprawnyId) return;
    let aktywne = true;
    pobierzKurs(idKursu)
      .then((dane) => {
        if (!aktywne) return;
        setKurs(dane);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (!aktywne) return;
        const blad = sklasyfikujBlad(idKursu, wyjatek);
        setStan(
          blad.rodzaj === "zakazane" ? "zakazane" : blad.rodzaj === "nie-znaleziono" ? "nie-znaleziono" : "blad",
        );
      });
    return () => {
      aktywne = false;
    };
  }, [idKursu, poprawnyId, proba]);

  const zamknijToast = useCallback(() => setToast(null), []);
  const zamknijChecklist = useCallback(() => setBraki([]), []);

  const powrotDoKursu = useCallback(() => {
    // Klawisz Escape w oknie potwierdzenia zamyka okno, nie ekran.
    if (potwierdzenieUsuniecia) return;
    router.push(adresKursu(idKursu));
  }, [router, idKursu, potwierdzenieUsuniecia]);

  async function ustawPublikacje(opublikowany: boolean) {
    if (zapisywanie) return;
    setZapisywanie(true);
    setKomunikat(null);
    setBraki([]);
    try {
      const po = await zmienPublikacje(idKursu, opublikowany);
      setKurs(po);
      setToast(opublikowany ? "Kurs został opublikowany." : "Publikacja kursu została cofnięta.");
    } catch (wyjatek) {
      const blad = sklasyfikujBlad(idKursu, wyjatek);
      if (blad.rodzaj === "nie-znaleziono") {
        setStan("nie-znaleziono");
      } else if (blad.rodzaj === "braki") {
        setBraki(blad.braki);
      } else {
        setKomunikat(
          komunikatBledu(blad, opublikowany ? "Nie udało się opublikować kursu" : "Nie udało się cofnąć publikacji"),
        );
      }
    } finally {
      setZapisywanie(false);
    }
  }

  async function potwierdzUsuniecie() {
    if (zapisywanie) return;
    setZapisywanie(true);
    setBladUsuniecia(null);
    try {
      await usunKurs(idKursu);
      setPotwierdzenieUsuniecia(false);
      setKomunikat(null);
      setBraki([]);
      setStan("usuniety");
    } catch (wyjatek) {
      const blad = sklasyfikujBlad(idKursu, wyjatek);
      if (blad.rodzaj === "nie-znaleziono") {
        setPotwierdzenieUsuniecia(false);
        setStan("nie-znaleziono");
      } else if (blad.rodzaj === "zakazane") {
        setBladUsuniecia("Brak uprawnień do usunięcia kursu.");
      } else if (blad.rodzaj === "siec") {
        setBladUsuniecia("Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.");
      } else if (blad.rodzaj === "blad" || blad.rodzaj === "braki") {
        setBladUsuniecia(blad.komunikat);
      }
    } finally {
      setZapisywanie(false);
    }
  }

  const okruszki = [
    { etykieta: "Administracja" },
    { etykieta: "Kursy" },
    ...(kurs ? [{ etykieta: kurs.title, href: adresKursu(idKursu) }] : []),
    { etykieta: "Publikacja" },
  ];

  function szablon(tytul: string, tresc: ReactNode, opcje: { opis?: string; opublikowany?: boolean } = {}) {
    return (
      <FormTemplate
        naglowek={
          <PageHeader
            okruszki={okruszki}
            tytul={tytul}
            opis={opcje.opis}
            status={
              opcje.opublikowany === undefined
                ? undefined
                : opcje.opublikowany
                  ? { wariant: "ok", etykieta: "Opublikowany" }
                  : { wariant: "neutral", etykieta: "Szkic" }
            }
            onPowrot={() => router.back()}
          />
        }
        powiadomienie={
          komunikat ? (
            <Notice wariant={komunikat.wariant} tytul={komunikat.tytul}>
              {komunikat.tresc}
            </Notice>
          ) : undefined
        }
        tresc={tresc}
      />
    );
  }

  if (stan === "ladowanie") {
    return szablon("Publikacja kursu", <Skeleton wiersze={4} />);
  }

  if (stan === "nie-znaleziono") {
    return szablon(
      "Publikacja kursu",
      <Notice wariant="warn" tytul="Nie znaleziono kursu">
        Kurs nie istnieje albo został usunięty.
      </Notice>,
    );
  }

  if (stan === "zakazane") {
    return szablon(
      "Publikacja kursu",
      <EmptyState
        wariant="brak-uprawnien"
        naglowek="Publikacja kursu dla administracji"
        rola="administracji"
        przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
      />,
    );
  }

  if (stan === "blad" || !kurs) {
    return szablon(
      "Publikacja kursu",
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać kursu"
        akcja={
          <Button
            poziom="outline"
            onClick={() => {
              setStan("ladowanie");
              setProba((n) => n + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        }
      >
        Brak odpowiedzi serwera. Sprawdź internet i spróbuj ponownie.
      </Notice>,
    );
  }

  if (stan === "usuniety") {
    return szablon(
      "Kurs usunięty",
      <div className={style.kolumna}>
        <Notice wariant="ok" tytul="Kurs został usunięty">
          Postęp uczestników zostaje zachowany.
        </Notice>
        <Text>
          <Link href={ADRES_LISTY_KURSOW}>Wróć do listy kursów</Link>
        </Text>
      </div>,
    );
  }

  return szablon(
    kurs.title,
    <div className={style.kolumna} data-stan-publikacji={kurs.is_published ? "opublikowany" : "szkic"}>
      {kurs.is_published ? (
        <section className={style.blok}>
          <Heading stopien={2}>Publikacja kursu</Heading>
          <Text>Kurs jest opublikowany — uczestnicy widzą go w swojej ścieżce.</Text>
          <div className={style.rzadkie}>
            <Button poziom="outline" onClick={() => void ustawPublikacje(false)}>
              Cofnij publikację
            </Button>
          </div>
        </section>
      ) : (
        <FormSection
          tytul="Publikacja kursu"
          pola={[]}
          etykietaAnuluj="Wróć do kursu"
          etykietaZapisz="Opublikuj kurs"
          onAnuluj={powrotDoKursu}
          onZapisz={() => void ustawPublikacje(true)}
        />
      )}

      {braki.length > 0 && (
        <div className={style.checklist}>
          <PublishChecklist tytul="Braki przed publikacją" braki={braki} gotowe={[]} onZamknij={zamknijChecklist} />
        </div>
      )}

      <CollapsibleSection
        tytul="Usunięcie kursu"
        liczba={1}
        dzieci={
          <div className={style.rzadkie}>
            <Button
              poziom="outline"
              niebezpieczny
              onClick={() => {
                setBladUsuniecia(null);
                setPotwierdzenieUsuniecia(true);
              }}
            >
              Usuń kurs
            </Button>
          </div>
        }
      />

      {toast && <Toast komunikat={toast} onZamknij={zamknijToast} />}

      {potwierdzenieUsuniecia && (
        <Dialog
          tytul="Usunąć kurs?"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń kurs"
          niebezpieczne
          onWycofaj={() => setPotwierdzenieUsuniecia(false)}
          onPotwierdz={() => void potwierdzUsuniecie()}
        >
          {bladUsuniecia && (
            <Notice wariant="error" tytul="Nie udało się usunąć kursu">
              {bladUsuniecia}
            </Notice>
          )}
          <Text>{`Kurs „${kurs.title}” zniknie z listy. Postęp uczestników zostaje zachowany.`}</Text>
        </Dialog>
      )}
    </div>,
    {
      opis: kurs.is_published
        ? undefined
        : "Kurs jest szkicem — uczestnicy go nie widzą. Po opublikowaniu pojawi się w ich ścieżce.",
      opublikowany: kurs.is_published,
    },
  );
}
