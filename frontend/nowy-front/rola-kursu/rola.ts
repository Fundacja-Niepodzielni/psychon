import type { GrupaTras } from "@/lib/api/h08-tematy";
import {
  deleteInstructorLesson,
  deleteInstructorMaterial,
  fetchInstructorCourse,
  fetchInstructorTest,
  updateInstructorCourse,
  uploadInstructorMaterialForLesson,
} from "@/lib/api/prowadzacy-kursy";
import type { AdminCourse } from "@/lib/h08/types";
import { GRUPY, czyNowaTrasaDostepna, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import { pobierzTestKursu } from "@/nowy-front/kurs-administracji/dane";
import {
  dodajLekcje,
  pobierzLekcjeKursu,
  pobierzMaterialyLekcji,
  pobierzStanNagrania,
  usunLekcje,
  usunMaterial,
  wgrajMaterial,
  zapiszLekcje,
  zlecWgranieNagrania,
  type CialoLekcji,
  type CialoNowejLekcji,
  type LekcjaAdmin,
  type MaterialAdmin,
  type StanNagrania,
  type ZlecenieWgrania,
} from "@/nowy-front/lekcja-edycja/dane";
import { pobierzKurs, zapiszKurs, type CialoKursu } from "@/nowy-front/publikacja-kursu/dane";
import { NAGRANIE_PROWADZACEGO } from "./nagranie-prowadzacego";
import {
  dodajLekcjeProwadzacego,
  pobierzLekcjeKursuProwadzacego,
  pobierzStanNagraniaProwadzacego,
  zapiszLekcjeProwadzacego,
  zlecWgranieNagraniaProwadzacego,
} from "./trasy-prowadzacego";

/**
 * Rola, w której działa ekran kursu (`kurs-administracji`) i strona lekcji
 * (`lekcja-edycja`): administracja albo prowadzący. Jeden ekran, dwie
 * warstwy danych — trasy `/admin/…` albo `/instructor/…` — i lista tego,
 * czego prowadzący na ekranie nie ma (publikacja, prowadzący kursu,
 * zaproszenia, usunięcie kursu). Wariant administracji woła dokładnie te
 * same funkcje danych co dotąd.
 */
export type RolaKursu = GrupaTras;

export interface DaneRoliKursu {
  pobierzKurs: (idKursu: string) => Promise<AdminCourse>;
  /** Zapis danych kursu z karty „Ustawienia kursu”. */
  zapiszDaneKursu: (idKursu: number, cialo: CialoKursu) => Promise<AdminCourse>;
  pobierzLekcjeKursu: (idKursu: number) => Promise<LekcjaAdmin[]>;
  dodajLekcje: (idKursu: number, cialo: CialoNowejLekcji) => Promise<LekcjaAdmin>;
  zapiszLekcje: (idLekcji: number, cialo: CialoLekcji | Pick<CialoLekcji, "title">) => Promise<LekcjaAdmin>;
  usunLekcje: (idLekcji: number) => Promise<{ id: number; deleted: boolean }>;
  pobierzMaterialyLekcji: (idLekcji: number) => Promise<MaterialAdmin[]>;
  wgrajMaterial: (idLekcji: number, plik: File) => Promise<MaterialAdmin>;
  usunMaterial: (idMaterialu: number) => Promise<{ id: number; deleted: boolean }>;
  pobierzStanNagrania: (idLekcji: number) => Promise<StanNagrania>;
  zlecWgranieNagrania: (idLekcji: number, tytul: string) => Promise<ZlecenieWgrania>;
  pobierzTestKursu: (idKursu: number) => Promise<{ id: number } | null>;
}

export interface KonfiguracjaRoliKursu {
  rola: RolaKursu;
  dane: DaneRoliKursu;
  adresListyKursow: string;
  /** Ekran kursu: adres produktu po włączeniu grupy, wcześniej trasa poligonu. */
  adresKursu: (idKursu: number) => string;
  /** Strona lekcji otwierana z ekranu lekcji (sąsiednie lekcje); `podKursem` — adres produktu z kursem w ścieżce. */
  adresLekcji: (idKursu: number, idLekcji: number, podKursem: boolean) => string;
  /** Strona lekcji otwierana „Otwórz” z ekranu kursu; `null` — wiersz nie ma wtedy „Otwórz”. */
  adresStronyLekcjiZKursu: (idLekcji: number, idKursu: string) => string | null;
  /** Ekran pytań testu kursu; numer kursu jedzie w parametrze `kurs` (okruszek ekranu pytań wraca do kursu). */
  adresTestu: (idTestu: number, idKursu: number) => string;
  /** Dopełniacz w zdaniu odmowy „…tylko dla {rola}.”. */
  rolaOdmowy: "administracji" | "prowadzących";
  /** Karta „Nagranie” i pytania o stan nagrań. */
  nagranie: boolean;
  /** Karta „Pliki do tej lekcji” — wymaga trasy listy plików lekcji. */
  plikiLekcji: boolean;
  /** Wiersz testu w drzewie kursu: test czyta `dane.pobierzTestKursu`, odnośnik prowadzi do ekranu pytań testu (`adresTestu`). */
  testKursu: boolean;
  /**
   * Publikacja i cofnięcie publikacji, prowadzący kursu, zaproszenia,
   * usunięcie kursu oraz rodzaj, grupa i adres w danych kursu — wyłącznie administracja.
   */
  zarzadzanieKursem: boolean;
}

/** Strona lekcji prowadzącego pod adresem produktu, z kursem w ścieżce. */
export const WZOR_LEKCJI_PROWADZACEGO = "/prowadzacy/kursy/[id]/lekcje/[idLekcji]";

function wzorKursu(grupa: DefinicjaGrupy): string {
  const [ekran] = grupa.ekrany;
  return czyNowaTrasaDostepna(grupa) ? ekran.nowaTrasa : ekran.trasaPoligonu;
}

function lekcjaAdministracji(idKursu: number | string, idLekcji: number, podKursem: boolean): string {
  const [ekran] = GRUPY.edycjaLekcji.ekrany;
  if (podKursem) return ekran.nowaTrasa.replace("[id]", String(idKursu)).replace("[idLekcji]", String(idLekcji));
  return `${ekran.trasaPoligonu.replace("[id]", String(idLekcji))}?kurs=${idKursu}`;
}

/** Na trasie poligonu kurs stoi w ścieżce, a lekcja w zapytaniu (`?lekcja=`). */
function lekcjaProwadzacego(idKursu: number | string, idLekcji: number, podKursem: boolean): string {
  if (podKursem) return WZOR_LEKCJI_PROWADZACEGO.replace("[id]", String(idKursu)).replace("[idLekcji]", String(idLekcji));
  const [ekran] = GRUPY.kurs.ekrany;
  return `${ekran.trasaPoligonu.replace("[id]", String(idKursu))}?lekcja=${idLekcji}`;
}

const DANE_ADMINISTRACJI: DaneRoliKursu = {
  pobierzKurs: (idKursu) => pobierzKurs(idKursu),
  zapiszDaneKursu: (idKursu, cialo) => zapiszKurs(idKursu, cialo),
  pobierzLekcjeKursu: (idKursu) => pobierzLekcjeKursu(idKursu),
  dodajLekcje: (idKursu, cialo) => dodajLekcje(idKursu, cialo),
  zapiszLekcje: (idLekcji, cialo) => zapiszLekcje(idLekcji, cialo),
  usunLekcje: (idLekcji) => usunLekcje(idLekcji),
  pobierzMaterialyLekcji: (idLekcji) => pobierzMaterialyLekcji(idLekcji),
  wgrajMaterial: (idLekcji, plik) => wgrajMaterial(idLekcji, plik),
  usunMaterial: (idMaterialu) => usunMaterial(idMaterialu),
  pobierzStanNagrania: (idLekcji) => pobierzStanNagrania(idLekcji),
  zlecWgranieNagrania: (idLekcji, tytul) => zlecWgranieNagrania(idLekcji, tytul),
  pobierzTestKursu: (idKursu) => pobierzTestKursu(idKursu),
};

const DANE_PROWADZACEGO: DaneRoliKursu = {
  pobierzKurs: (idKursu) => fetchInstructorCourse(Number(idKursu)),
  // Prowadzący zmienia wyłącznie treść kursu: tytuł i opis (`InstructorCourseContentPayload`).
  zapiszDaneKursu: (idKursu, cialo) =>
    updateInstructorCourse(idKursu, { title: cialo.title, description: cialo.description }),
  pobierzLekcjeKursu: (idKursu) => pobierzLekcjeKursuProwadzacego(idKursu),
  dodajLekcje: (idKursu, cialo) => dodajLekcjeProwadzacego(idKursu, cialo),
  zapiszLekcje: (idLekcji, cialo) => zapiszLekcjeProwadzacego(idLekcji, cialo),
  usunLekcje: (idLekcji) => deleteInstructorLesson(idLekcji),
  // Zaplecze nie ma listy plików lekcji prowadzącego; karta plików jest wtedy pominięta (`plikiLekcji: false`).
  pobierzMaterialyLekcji: () => Promise.reject(new Error("Brak trasy listy plików lekcji prowadzącego.")),
  wgrajMaterial: (idLekcji, plik) => uploadInstructorMaterialForLesson(idLekcji, plik),
  usunMaterial: (idMaterialu) => deleteInstructorMaterial(idMaterialu),
  pobierzStanNagrania: (idLekcji) => pobierzStanNagraniaProwadzacego(idLekcji),
  zlecWgranieNagrania: (idLekcji, tytul) => zlecWgranieNagraniaProwadzacego(idLekcji, tytul),
  pobierzTestKursu: (idKursu) => fetchInstructorTest(idKursu),
};

/** Konfiguracja ekranu w danej roli; stała nagrania prowadzącego czytana przy każdym wywołaniu. */
export function konfiguracjaRoli(rola: RolaKursu): KonfiguracjaRoliKursu {
  if (rola === "instructor") {
    return {
      rola,
      dane: DANE_PROWADZACEGO,
      adresListyKursow: "/prowadzacy/kursy",
      adresKursu: (idKursu) => wzorKursu(GRUPY.kurs).replace("[id]", String(idKursu)),
      adresLekcji: lekcjaProwadzacego,
      adresStronyLekcjiZKursu: (idLekcji, idKursu) =>
        lekcjaProwadzacego(idKursu, idLekcji, czyNowaTrasaDostepna(GRUPY.kurs)),
      adresTestu: (idTestu, idKursu) => `/prowadzacy/testy/${idTestu}/pytania?kurs=${idKursu}`,
      rolaOdmowy: "prowadzących",
      nagranie: NAGRANIE_PROWADZACEGO,
      plikiLekcji: false,
      testKursu: true,
      zarzadzanieKursem: false,
    };
  }
  return {
    rola,
    dane: DANE_ADMINISTRACJI,
    adresListyKursow: "/admin/kursy",
    adresKursu: (idKursu) => wzorKursu(GRUPY.kursAdministracji).replace("[id]", String(idKursu)),
    adresLekcji: lekcjaAdministracji,
    adresStronyLekcjiZKursu: (idLekcji, idKursu) =>
      czyNowaTrasaDostepna(GRUPY.edycjaLekcji) ? lekcjaAdministracji(idKursu, idLekcji, true) : null,
    adresTestu: (idTestu, idKursu) => `/admin/testy/${idTestu}/pytania?kurs=${idKursu}`,
    rolaOdmowy: "administracji",
    nagranie: true,
    plikiLekcji: true,
    testKursu: true,
    zarzadzanieKursem: true,
  };
}
