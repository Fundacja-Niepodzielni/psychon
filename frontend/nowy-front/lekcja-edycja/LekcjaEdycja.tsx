"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Button } from "@/design-system/atomy/Button/Button";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { FileDropZone, type PlikFileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { TrescLekcji } from "@/design-system/molekuly/TrescLekcji/TrescLekcji";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { pobierzKurs } from "@/nowy-front/publikacja-kursu/dane";
import {
  czyBrakUprawnien,
  czyNieZnaleziono,
  pobierzLekcjeKursu,
  pobierzRole,
  pobierzStanNagrania,
  usunLekcje,
  usunMaterial,
  wgrajMaterial,
  zapiszLekcje,
  zlecWgranieNagrania,
  type LekcjaAdmin,
  type MaterialAdmin,
  type StanNagrania,
} from "./dane";
import {
  bledyZSerwera,
  cialoZapisu,
  formularzeRowne,
  formularzZLekcji,
  liczZnaki,
  opisLicznika,
  opisNagrania,
  powodNieaktywnegoNagrania,
  walidujLokalnie,
  zdanieBleduPliku,
  zdanieBleduUsuniecia,
  zdanieBleduUsunieciaMaterialu,
  zdanieBleduZapisu,
  type BledyFormularza,
  type StanFormularza,
} from "./formularz";
import { useWgrywanieMaterialow } from "./materialy";
import { wgrajNagranie } from "./tus";
import style from "./LekcjaEdycja.module.css";

interface WlasciwosciLekcjaEdycja {
  /** `null` = identyfikator z adresu nie jest liczbą. */
  idLekcji: number | null;
  /** Kurs, z którego ekran tematów otwiera lekcję (`?kurs=`); `null` = brak. */
  idKursu: number | null;
  /**
   * Ekran pod adresem produktu z kursem w ścieżce: okruszki niosą nazwę kursu
   * (odczyt `GET /admin/courses/{course}`) i łącze do listy kursów. Bez tej
   * właściwości (trasa poligonu) okruszki zostają jak dotąd.
   */
  zNazwaKursu?: boolean;
}

/** Nazwa kursu do okruszków: `undefined` = ekran jej nie pokazuje, `null` = jeszcze nieznana albo odczyt się nie udał. */
type NazwaKursu = string | null | undefined;

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "blad" }
  | { rodzaj: "dane"; lekcja: LekcjaAdmin; rola: string | null; nagranie: StanNagrania | null };

/** Ekran kursu administracji: adres produktu po włączeniu grupy, wcześniej trasa poligonu. */
function adresKursu(idKursu: number): string {
  const [ekran] = GRUPY.kursAdministracji.ekrany;
  const wzorzec = czyNowaTrasaDostepna(GRUPY.kursAdministracji) ? ekran.nowaTrasa : ekran.trasaPoligonu;
  return wzorzec.replace("[id]", String(idKursu));
}

function okruszki(idKursu: number | null, nazwaKursu?: NazwaKursu) {
  return [
    nazwaKursu === undefined ? { etykieta: "Kursy" } : { etykieta: "Kursy", href: ADRES_LISTY_KURSOW },
    { etykieta: nazwaKursu || "Tematy i lekcje", href: idKursu === null ? undefined : adresKursu(idKursu) },
    { etykieta: "Lekcja" },
  ];
}

const ADRES_LISTY_KURSOW = "/admin/kursy";

interface WlasciwosciSzablonuStanu {
  tytul: string;
  idKursu: number | null;
  nazwaKursu?: NazwaKursu;
  wroc: () => void;
  tresc: ReactNode;
}

/** Każdy stan poza danymi renderuje się wewnątrz tego samego szablonu — jedyny `main` ekranu. */
function SzablonStanu({ tytul, idKursu, nazwaKursu, wroc, tresc }: WlasciwosciSzablonuStanu) {
  return (
    <FormTemplate
      naglowek={<PageHeader okruszki={okruszki(idKursu, nazwaKursu)} tytul={tytul} onPowrot={wroc} />}
      tresc={tresc}
    />
  );
}

/**
 * Ekran „Lekcja: treść, nagranie, materiały” (administracja) na szablonie
 * `FormTemplate`. Lekcję wybiera się z listy kursu — `GET /admin/courses/{course}/lessons`
 * (`backend/routes/api/h08.php:43`), bo trasy pojedynczej lekcji dla
 * administracji nie ma; kurs niesie adres (`?kurs=`).
 *
 * Stany: ładowanie, dane, brak uprawnień (401/403), nie znaleziono (404 albo
 * lekcja spoza kursu), błąd połączenia. Zapis, błędy pól i wgrywanie plików
 * żyją w `EdytorLekcji`.
 */
export function LekcjaEdycja({ idLekcji, idKursu, zNazwaKursu = false }: WlasciwosciLekcjaEdycja) {
  const router = useRouter();
  const wroc = () => router.back();
  const adresPoprawny = idLekcji !== null && idKursu !== null;
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [tytulKursu, setTytulKursu] = useState<string | null>(null);
  const nazwaKursu: NazwaKursu = zNazwaKursu ? tytulKursu : undefined;

  // Nazwa kursu jest dodatkiem okruszków: jej błąd nie blokuje ekranu lekcji.
  useEffect(() => {
    if (!zNazwaKursu || idKursu === null) return;
    let aktualne = true;
    pobierzKurs(String(idKursu))
      .then((kurs) => {
        if (aktualne) setTytulKursu(kurs.title);
      })
      .catch(() => undefined);
    return () => {
      aktualne = false;
    };
  }, [zNazwaKursu, idKursu]);

  useEffect(() => {
    if (idLekcji === null || idKursu === null) return;
    let aktualne = true;
    (async () => {
      try {
        const lekcje = await pobierzLekcjeKursu(idKursu);
        const lekcja = lekcje.find((kandydat) => kandydat.id === idLekcji);
        if (!lekcja) {
          if (aktualne) setStan({ rodzaj: "nie-znaleziono" });
          return;
        }
        // Rola i stan nagrania są dodatkiem: ich błąd nie blokuje edycji tekstu.
        const [rola, nagranie] = await Promise.all([
          pobierzRole().catch(() => null),
          pobierzStanNagrania(idLekcji).catch(() => null),
        ]);
        if (aktualne) setStan({ rodzaj: "dane", lekcja, rola, nagranie });
      } catch (blad) {
        if (!aktualne) return;
        if (czyBrakUprawnien(blad)) setStan({ rodzaj: "brak-uprawnien" });
        else if (czyNieZnaleziono(blad)) setStan({ rodzaj: "nie-znaleziono" });
        else setStan({ rodzaj: "blad" });
      }
    })();
    return () => {
      aktualne = false;
    };
  }, [idLekcji, idKursu, proba]);

  if (!adresPoprawny || stan.rodzaj === "nie-znaleziono") {
    return (
      <SzablonStanu
        tytul="Lekcja"
        idKursu={idKursu}
        nazwaKursu={nazwaKursu}
        wroc={wroc}
        tresc={
          <EmptyState
            naglowek="Nie znaleziono lekcji"
            tresc="Lekcja nie istnieje albo została usunięta. Otwórz ją z ekranu tematów i lekcji kursu."
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }
  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <SzablonStanu
        tytul="Lekcja"
        idKursu={idKursu}
        nazwaKursu={nazwaKursu}
        wroc={wroc}
        tresc={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Edycja lekcji"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }
  if (stan.rodzaj === "blad") {
    return (
      <SzablonStanu
        tytul="Lekcja"
        idKursu={idKursu}
        nazwaKursu={nazwaKursu}
        wroc={wroc}
        tresc={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać lekcji"
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
            Serwer nie odpowiedział albo zwrócił błąd. Treść lekcji nie jest pokazywana bez danych.
          </Notice>
        }
      />
    );
  }
  if (stan.rodzaj === "ladowanie") {
    return (
      <SzablonStanu
        tytul="Lekcja"
        idKursu={idKursu}
        nazwaKursu={nazwaKursu}
        wroc={wroc}
        tresc={
          <div className={style.szkielet}>
            <Skeleton wiersze={3} />
            <Skeleton wiersze={8} />
            <Skeleton wariant="przycisk" />
          </div>
        }
      />
    );
  }
  return (
    <EdytorLekcji
      lekcja={stan.lekcja}
      idKursu={idKursu}
      nazwaKursu={nazwaKursu}
      rola={stan.rola}
      nagranieStart={stan.nagranie}
      wroc={wroc}
    />
  );
}

interface WlasciwosciEdytora {
  lekcja: LekcjaAdmin;
  idKursu: number | null;
  nazwaKursu?: NazwaKursu;
  rola: string | null;
  nagranieStart: StanNagrania | null;
  wroc: () => void;
  /**
   * `strona` — cały ekran w `FormTemplate` (trasa lekcji). `wiersz` — sam
   * formularz pól lekcji, do osadzenia pod wierszem lekcji w drzewie kursu;
   * materiały i nagranie zostają na ekranie lekcji.
   */
  uklad?: "strona" | "wiersz";
  onZapisano?: (lekcja: LekcjaAdmin) => void;
  /** Dodatki formularza przy wierszu; ekran lekcji ich nie podaje. */
  wiersz?: DodatkiWiersza;
}

/**
 * To, co formularz przy wierszu zgłasza ekranowi kursu i czego od niego
 * potrzebuje. Ekran kursu decyduje o pytaniu przed porzuceniem zmian —
 * formularz tylko mówi, czy je ma.
 */
export interface DodatkiWiersza {
  /** Czy formularz ma niezapisane zmiany — przy każdej zmianie tej odpowiedzi. */
  onZmieniono: (zmieniony: boolean) => void;
  /** Ekran kursu pokazuje własne okno pytania: Escape i „Anuluj” nic wtedy nie robią. */
  wstrzymany: boolean;
  /** Adres ekranu lekcji z materiałami i nagraniem; `null` = ekran niedostępny, odnośnika nie ma. */
  adresMaterialow: string | null;
  onPrzejdz: (adres: string) => void;
  /** Lekcja została usunięta na serwerze. */
  onUsunieto: () => void;
}

function EdytorLekcji({
  lekcja,
  idKursu,
  nazwaKursu,
  rola,
  nagranieStart,
  wroc,
  uklad = "strona",
  onZapisano,
  wiersz,
}: WlasciwosciEdytora) {
  const baza = useId();
  const [zapisana, setZapisana] = useState(lekcja);
  const [formularz, setFormularz] = useState<StanFormularza>(() => formularzZLekcji(lekcja));
  const [bledy, setBledy] = useState<BledyFormularza>({});
  const [bladOgolny, setBladOgolny] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [zapisano, setZapisano] = useState(false);
  const [dialogPorzucenia, setDialogPorzucenia] = useState(false);
  const [dialogUsuniecia, setDialogUsuniecia] = useState(false);
  const [usuwanie, setUsuwanie] = useState(false);
  const [bladUsuniecia, setBladUsuniecia] = useState<string | null>(null);
  const [liczbaMaterialow, setLiczbaMaterialow] = useState(lekcja.materials_count);
  const materialy = useWgrywanieMaterialow(
    (plik) => wgrajMaterial(zapisana.id, plik),
    () => setLiczbaMaterialow((poprzednia) => poprzednia + 1),
  );
  const [materialDoUsuniecia, setMaterialDoUsuniecia] = useState<MaterialAdmin | null>(null);
  const [bladMaterialu, setBladMaterialu] = useState<string | null>(null);
  const [plikiNagrania, setPlikiNagrania] = useState<PlikFileDropZone[]>([]);
  const [nagranie, setNagranie] = useState<StanNagrania | null>(nagranieStart);

  const zmieniony = !formularzeRowne(formularz, formularzZLekcji(zapisana));
  const powodNagrania = powodNieaktywnegoNagrania(rola);
  const liczbaZnakow = liczZnaki(formularz.content);

  // Wyjście z niezapisanymi zmianami pyta — także zamknięcie karty.
  useEffect(() => {
    if (!zmieniony) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [zmieniony]);

  // Ekran kursu pyta przed porzuceniem zmian — musi wiedzieć, czy są.
  const zglosZmiane = wiersz?.onZmieniono;
  useEffect(() => {
    zglosZmiane?.(zmieniony);
  }, [zglosZmiane, zmieniony]);

  // Formularz otwarty przy wierszu zaczyna od pierwszego pola.
  useEffect(() => {
    if (uklad === "wiersz") document.getElementById(`${baza}-tytul`)?.focus();
  }, [uklad, baza]);

  function zmien(pole: keyof StanFormularza, wartosc: string) {
    setFormularz((poprzedni) => ({ ...poprzedni, [pole]: wartosc }));
    setZapisano(false);
  }

  function anuluj() {
    // Escape i przycisk „Anuluj” wołają to samo; przy otwartym oknie pytania nic nie robią.
    if (zapisywanie || dialogPorzucenia || dialogUsuniecia || wiersz?.wstrzymany) return;
    if (zmieniony) {
      setDialogPorzucenia(true);
      return;
    }
    wroc();
  }

  async function zapisz() {
    if (zapisywanie) return;
    const lokalne = walidujLokalnie(formularz);
    setBladOgolny(null);
    if (Object.keys(lokalne).length > 0) {
      setBledy(lokalne);
      return;
    }
    setBledy({});
    setZapisywanie(true);
    setZapisano(false);
    try {
      const wynik = await zapiszLekcje(zapisana.id, cialoZapisu(formularz, zapisana));
      setZapisana(wynik);
      setFormularz(formularzZLekcji(wynik));
      setLiczbaMaterialow(wynik.materials_count);
      setZapisano(true);
      onZapisano?.(wynik);
    } catch (blad) {
      const bledyPol = bledyZSerwera(blad);
      if (bledyPol) setBledy(bledyPol);
      else setBladOgolny(zdanieBleduZapisu(blad));
    } finally {
      setZapisywanie(false);
    }
  }

  async function usun() {
    if (usuwanie) return;
    setDialogUsuniecia(false);
    setUsuwanie(true);
    setBladUsuniecia(null);
    try {
      await usunLekcje(zapisana.id);
      wiersz?.onUsunieto();
    } catch (blad) {
      setBladUsuniecia(zdanieBleduUsuniecia(blad));
      setUsuwanie(false);
    }
  }

  async function usunWgranyMaterial(material: MaterialAdmin) {
    setMaterialDoUsuniecia(null);
    setBladMaterialu(null);
    try {
      await usunMaterial(material.id);
      // Przycisk „Usuń” tego pliku znika razem z wierszem — fokus idzie na pole dodawania.
      document.getElementById(`${baza}-plik-materialu-obszar`)?.focus();
      materialy.zdejmij(material);
      setLiczbaMaterialow((poprzednia) => Math.max(0, poprzednia - 1));
    } catch (blad) {
      setBladMaterialu(zdanieBleduUsunieciaMaterialu(blad));
    }
  }

  async function dodajNagranie(lista: FileList) {
    const plik = lista[0];
    if (!plik) return;
    const ustaw = (stan: PlikFileDropZone["stan"], komunikat: string) =>
      setPlikiNagrania([{ nazwa: plik.name, stan, komunikat }]);
    if (plik.type !== "" && !plik.type.startsWith("video/")) {
      ustaw("blad", "Wybierz plik wideo.");
      return;
    }
    ustaw("przetwarzanie", "Przygotowanie wgrania…");
    try {
      const zlecenie = await zlecWgranieNagrania(zapisana.id, zapisana.title);
      await wgrajNagranie(plik, zlecenie, zapisana.title, (postep) =>
        ustaw("przetwarzanie", `Wgrywanie… ${Math.floor((postep.wyslano * 100) / postep.razem)}%`),
      );
      ustaw("gotowy", "Wgrano. Nagranie jest przetwarzane.");
      setZapisana((poprzednia) => ({ ...poprzednia, video_provider_id: zlecenie.video_id }));
      setNagranie(await pobierzStanNagrania(zapisana.id).catch(() => null));
    } catch (blad) {
      ustaw("blad", zdanieBleduPliku(blad));
    }
  }

  const pola = [
    {
      id: `${baza}-tytul`,
      etykieta: "Tytuł lekcji",
      rodzaj: "tekst" as const,
      wymagane: true,
      wartosc: formularz.title,
      onZmiana: (wartosc: string) => zmien("title", wartosc),
      blad: bledy.title,
    },
    {
      id: `${baza}-opis`,
      etykieta: "Krótki opis lekcji",
      rodzaj: "wieloliniowy" as const,
      wartosc: formularz.description,
      onZmiana: (wartosc: string) => zmien("description", wartosc),
      blad: bledy.description,
    },
    {
      id: `${baza}-tresc`,
      etykieta: "Treść lekcji",
      rodzaj: "wieloliniowy" as const,
      wartosc: formularz.content,
      onZmiana: (wartosc: string) => zmien("content", wartosc),
      podpowiedz: `${opisLicznika(liczbaZnakow)} Akapity rozdziel pustym wierszem, nagłówki zapisz jako ## i ###, listy jako „- punkt”.`,
      blad: bledy.content,
    },
    {
      id: `${baza}-czas`,
      etykieta: "Czas trwania w minutach",
      rodzaj: "liczba" as const,
      wartosc: formularz.duration,
      onZmiana: (wartosc: string) => zmien("duration", wartosc),
      podpowiedz: "Lekcja z czasem 0 nie może zostać ukończona przez uczestnika.",
      blad: bledy.duration,
    },
  ];

  const okna = (
    <>
      {dialogPorzucenia && (
        <Dialog
          tytul="Porzucić niezapisane zmiany?"
          etykietaWycofania="Wróć do edycji"
          etykietaPotwierdzenia="Porzuć zmiany"
          onWycofaj={() => setDialogPorzucenia(false)}
          onPotwierdz={() => {
            setDialogPorzucenia(false);
            wroc();
          }}
        >
          <Text>Zmiany wpisane w tej lekcji nie zostały zapisane i przepadną.</Text>
        </Dialog>
      )}
      {dialogUsuniecia && (
        <Dialog
          tytul={`Usunąć lekcję „${zapisana.title}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń lekcję"
          onWycofaj={() => setDialogUsuniecia(false)}
          onPotwierdz={() => void usun()}
        >
          <Text>Lekcja zniknie z kursu. Postęp historyczny uczestników zostaje zachowany.</Text>
        </Dialog>
      )}
      {materialDoUsuniecia && (
        <Dialog
          tytul={`Usunąć materiał „${materialDoUsuniecia.name}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń materiał"
          onWycofaj={() => setMaterialDoUsuniecia(null)}
          onPotwierdz={() => void usunWgranyMaterial(materialDoUsuniecia)}
        >
          <Text>Pliku nie da się przywrócić.</Text>
        </Dialog>
      )}
      {zapisano && uklad === "strona" && (
        <Toast komunikat="Lekcja została zapisana." onZamknij={() => setZapisano(false)} />
      )}
    </>
  );

  // Przy wierszu powiadomienie stoi pod formularzem, w jego miejscu na stronie —
  // nie na dole okna, gdzie zasłaniało nagłówek kolejnego tematu.
  const powiadomienieWiersza = zapisano && (
    <div className={style.powiadomienieWiersza}>
      <Toast komunikat="Lekcja została zapisana." onZamknij={() => setZapisano(false)} />
    </div>
  );

  if (uklad === "wiersz") {
    return (
      <>
        <div className={style.kolumna}>
          {bladOgolny && (
            <Notice wariant="error" tytul="Lekcja nie została zapisana">
              {bladOgolny}
            </Notice>
          )}
          <FormSection
            tytul="Edycja lekcji"
            szerokosc="lekcja"
            pola={pola}
            etykietaAnuluj="Anuluj"
            etykietaZapisz="Zapisz lekcję"
            onAnuluj={anuluj}
            onZapisz={() => void zapisz()}
          />
          {powiadomienieWiersza}
          {bladUsuniecia && (
            <Notice wariant="error" tytul="Lekcja nie została usunięta">
              {bladUsuniecia}
            </Notice>
          )}
          {wiersz && (
            <div className={style.akcjeWiersza}>
              {wiersz.adresMaterialow !== null && (
                <Link
                  href={wiersz.adresMaterialow}
                  onClick={(zdarzenie) => {
                    zdarzenie.preventDefault();
                    if (wiersz.adresMaterialow !== null) wiersz.onPrzejdz(wiersz.adresMaterialow);
                  }}
                >
                  Materiały i nagranie
                </Link>
              )}
              <Button
                poziom="quiet"
                niebezpieczny
                aria-label={`Usuń lekcję „${zapisana.title}”`}
                onClick={() => setDialogUsuniecia(true)}
              >
                Usuń lekcję
              </Button>
            </div>
          )}
        </div>
        {okna}
      </>
    );
  }

  return (
    <>
      <FormTemplate
        naglowek={<PageHeader okruszki={okruszki(idKursu, nazwaKursu)} tytul={zapisana.title} onPowrot={anuluj} />}
        powiadomienie={
          bladOgolny ? (
            <Notice wariant="error" tytul="Lekcja nie została zapisana">
              {bladOgolny}
            </Notice>
          ) : undefined
        }
        tresc={
          <div className={style.kolumna}>
            <FormSection
              tytul="Edycja lekcji"
              szerokosc="lekcja"
              pola={pola}
              etykietaAnuluj="Anuluj"
              etykietaZapisz="Zapisz lekcję"
              onAnuluj={anuluj}
              onZapisz={() => void zapisz()}
            />

            <section className={style.sekcja} aria-labelledby={`${baza}-podglad`}>
              <Heading stopien={2} id={`${baza}-podglad`}>
                Podgląd treści
              </Heading>
              {formularz.content.trim() === "" ? (
                <Text wariant="pusty">Treść lekcji jest pusta. Uczestnik zobaczy tylko tytuł i krótki opis.</Text>
              ) : (
                <TrescLekcji tresc={formularz.content} />
              )}
            </section>

            <section className={style.sekcja} aria-labelledby={`${baza}-materialy`}>
              <Heading stopien={2} id={`${baza}-materialy`}>
                Materiały
              </Heading>
              <Text>{`Materiały przy tej lekcji: ${liczbaMaterialow}.`}</Text>
              <FileDropZone
                id={`${baza}-plik-materialu`}
                etykieta="Upuść tutaj materiały albo wybierz je z dysku."
                podpowiedz="Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Plik może mieć najwyżej 10 MB."
                pliki={materialy.pliki}
                onWybierzPliki={(lista) => void materialy.dodaj(lista)}
              />
              {bladMaterialu && (
                <Notice wariant="error" tytul="Materiał nie został usunięty">
                  {bladMaterialu}
                </Notice>
              )}
              {materialy.wgrane.length > 0 && (
                <ul className={style.wgrane} aria-label="Materiały wgrane teraz">
                  {materialy.wgrane.map((material) => (
                    <li key={material.id} className={style.wgrany}>
                      <span className={style.nazwaPliku}>{material.name}</span>
                      <Button
                        poziom="quiet"
                        niebezpieczny
                        aria-label={`Usuń materiał „${material.name}”`}
                        onClick={() => setMaterialDoUsuniecia(material)}
                      >
                        Usuń
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={style.sekcja} aria-labelledby={`${baza}-nagranie`}>
              <Heading stopien={2} id={`${baza}-nagranie`}>
                Nagranie
              </Heading>
              <Text>{opisNagrania(nagranie)}</Text>
              {powodNagrania ? (
                <Hint>{powodNagrania}</Hint>
              ) : (
                <FileDropZone
                  id={`${baza}-plik-nagrania`}
                  etykieta="Upuść tutaj nagranie albo wybierz je z dysku."
                  podpowiedz="Jedno nagranie na lekcję. Nowe nagranie zastępuje poprzednie."
                  pliki={plikiNagrania}
                  onWybierzPliki={(lista) => void dodajNagranie(lista)}
                />
              )}
            </section>
          </div>
        }
      />
      {okna}
    </>
  );
}

interface WlasciwosciEdycjiPrzyWierszu {
  idLekcji: number;
  idKursu: number;
  /** „Anuluj”, Escape albo porzucenie zmian — formularz ma zniknąć. */
  onZamknij: () => void;
  /** Lekcja po udanym zapisie; formularz zostaje otwarty. */
  onZapisano: (lekcja: LekcjaAdmin) => void;
  wiersz: DodatkiWiersza;
}

/**
 * Formularz edycji lekcji do osadzenia pod wierszem lekcji na ekranie kursu
 * administracji. Ten sam edytor i ta sama funkcja zapisu (`zapiszLekcje`) co
 * trasa lekcji; lekcję czyta świeżo z listy lekcji kursu przy każdym otwarciu.
 */
export function EdycjaLekcjiPrzyWierszu({
  idLekcji,
  idKursu,
  onZamknij,
  onZapisano,
  wiersz,
}: WlasciwosciEdycjiPrzyWierszu) {
  const [stan, setStan] = useState<
    { rodzaj: "ladowanie" } | { rodzaj: "blad"; tresc: string } | { rodzaj: "dane"; lekcja: LekcjaAdmin }
  >({ rodzaj: "ladowanie" });

  useEffect(() => {
    let aktualne = true;
    pobierzLekcjeKursu(idKursu)
      .then((lekcje) => {
        if (!aktualne) return;
        const lekcja = lekcje.find((kandydat) => kandydat.id === idLekcji);
        setStan(
          lekcja
            ? { rodzaj: "dane", lekcja }
            : { rodzaj: "blad", tresc: "Lekcja nie istnieje albo została usunięta." },
        );
      })
      .catch((blad: unknown) => {
        if (aktualne) setStan({ rodzaj: "blad", tresc: zdanieBleduZapisu(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [idKursu, idLekcji]);

  if (stan.rodzaj === "ladowanie") {
    return (
      <div aria-busy="true">
        <Skeleton wiersze={4} />
      </div>
    );
  }
  if (stan.rodzaj === "blad") {
    return (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać lekcji"
        akcja={
          <Button poziom="outline" onClick={onZamknij}>
            Zamknij
          </Button>
        }
      >
        {stan.tresc}
      </Notice>
    );
  }
  return (
    <EdytorLekcji
      lekcja={stan.lekcja}
      idKursu={idKursu}
      rola={null}
      nagranieStart={null}
      wroc={onZamknij}
      uklad="wiersz"
      onZapisano={onZapisano}
      wiersz={wiersz}
    />
  );
}
