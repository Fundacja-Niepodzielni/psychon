import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import {
  ADRES_GRUPY,
  ADRES_KURSOW,
  ADRES_PYTAN,
  LIMIT_WIERSZY,
  formatujTermin,
  nadchodzaceTerminy,
  odmien,
  pelneImie,
  skrocTresc,
  type KursProwadzacego,
  type PytaniaPulpitu,
  type RodzajAwarii,
  type Sekcja,
} from "./dane";
import { formatujDziesietny } from "./formatuj-dziesietny";
import type { InstructorGroup } from "@/lib/h12/types";

interface WspolneSekcji {
  onOdswiez: () => void;
}

function pusty(naglowek: string, tresc: string, onOdswiez: () => void) {
  return { naglowek, tresc, przycisk: { etykieta: "Odśwież pulpit", onClick: onOdswiez } };
}

const OPIS_AWARII: Record<RodzajAwarii, string> = {
  zakazane: "Ta sekcja nie jest dostępna dla Twojego konta. Pozostałe sekcje działają.",
  siec: "Brak połączenia z serwerem. Pozostałe sekcje działają — spróbuj ponownie za chwilę.",
  blad: "Serwer nie odpowiedział poprawnie. Pozostałe sekcje działają — spróbuj ponownie za chwilę.",
};

/** Sekcja, której odczyt się nie udał — reszta pulpitu zostaje na ekranie. */
export function AwariaSekcji({ nazwa, rodzaj, onOdswiez }: { nazwa: string; rodzaj: RodzajAwarii } & WspolneSekcji) {
  return (
    <Notice
      wariant="error"
      tytul={`Nie udało się wczytać: ${nazwa}`}
      akcja={
        <Button poziom="outline" onClick={onOdswiez}>
          Spróbuj ponownie
        </Button>
      }
    >
      {OPIS_AWARII[rodzaj]}
    </Notice>
  );
}

function ResztaListy({ pokazano, razem, nazwa, href, etykieta }: { pokazano: number; razem: number; nazwa: string; href: string; etykieta: string }) {
  if (razem <= pokazano) return null;
  return (
    <>
      <Hint>
        Pokazano {pokazano} z {razem} ({nazwa}).
      </Hint>
      <Link href={href}>{etykieta}</Link>
    </>
  );
}

export function SekcjaPytan({ sekcja, onOdswiez }: { sekcja: Sekcja<PytaniaPulpitu> } & WspolneSekcji) {
  if (sekcja.stan === "awaria") return <AwariaSekcji nazwa="pytania bez odpowiedzi" rodzaj={sekcja.rodzaj} onOdswiez={onOdswiez} />;
  const { liczba, wiersze } = sekcja.dane;
  const pokazane: WierszRecordList[] = wiersze.slice(0, LIMIT_WIERSZY).map((pytanie) => ({
    id: `pytanie-${pytanie.id}`,
    tytul: `${pelneImie(pytanie.user)} — ${pytanie.lesson.title}`,
    podpowiedz: `${pytanie.lesson.course.title}: ${skrocTresc(pytanie.question)}`,
    plakietka: { wariant: "pending", tekst: "czeka na odpowiedź" },
    akcja: { etykieta: "Odpowiedz", href: ADRES_PYTAN },
  }));
  return (
    <>
      <RecordList
        tytul={`Pytania bez odpowiedzi: ${liczba}`}
        wiersze={pokazane}
        pusty={pusty("Brak pytań bez odpowiedzi", "Pytania z Twoich kursów pojawią się tu, gdy uczestnicy je zadadzą.", onOdswiez)}
      />
      <ResztaListy pokazano={pokazane.length} razem={liczba} nazwa="pytań" href={ADRES_PYTAN} etykieta="Otwórz skrzynkę pytań" />
    </>
  );
}

export function SekcjaSuperwizji({ sekcja, teraz, onOdswiez }: { sekcja: Sekcja<InstructorGroup>; teraz: Date } & WspolneSekcji) {
  // Ta sama trasa co grupa: jedna awaria to jeden komunikat, w sekcji grupy.
  if (sekcja.stan === "awaria") return null;
  const terminy = nadchodzaceTerminy(sekcja.dane.slots, teraz);
  const wiersze: WierszRecordList[] = terminy.slice(0, LIMIT_WIERSZY).map((termin) => ({
    id: `termin-${termin.id}`,
    tytul: formatujTermin(termin.starts_at),
    podpowiedz: `Zajęte miejsca: ${termin.active_signups_count} z ${termin.seats_limit}.`,
    akcja: { etykieta: "Otwórz grupę", href: ADRES_GRUPY },
  }));
  return (
    <>
      <RecordList
        tytul={`Nadchodzące superwizje: ${terminy.length}`}
        wiersze={wiersze}
        pusty={pusty("Brak nadchodzących terminów", "Terminy superwizji wystawiasz w widoku grupy.", onOdswiez)}
      />
      <ResztaListy pokazano={wiersze.length} razem={terminy.length} nazwa="terminów" href={ADRES_GRUPY} etykieta="Wszystkie terminy" />
    </>
  );
}

export function SekcjaGrupy({ sekcja, onOdswiez }: { sekcja: Sekcja<InstructorGroup> } & WspolneSekcji) {
  if (sekcja.stan === "awaria") return <AwariaSekcji nazwa="moja grupa i terminy superwizji" rodzaj={sekcja.rodzaj} onOdswiez={onOdswiez} />;
  const { members } = sekcja.dane;
  const wiersze: WierszRecordList[] = members.slice(0, LIMIT_WIERSZY).map((osoba) => ({
    id: `osoba-${osoba.id}`,
    tytul: pelneImie(osoba),
    podpowiedz: `Kursy: ${osoba.progress.courses_done} z ${osoba.progress.courses_total} · staż: ${formatujDziesietny(osoba.progress.hours_accepted)} godz. · superwizje: ${osoba.progress.supervision_present}`,
    akcja: { etykieta: "Otwórz grupę", href: ADRES_GRUPY },
  }));
  return (
    <>
      <RecordList
        tytul={`Moja grupa: ${members.length} ${odmien(members.length, "osoba", "osoby", "osób")}`}
        wiersze={wiersze}
        pusty={pusty("Nie masz jeszcze przypisanej grupy", "Osoby do grupy przypisuje administracja.", onOdswiez)}
      />
      <ResztaListy pokazano={wiersze.length} razem={members.length} nazwa="osób" href={ADRES_GRUPY} etykieta="Cała grupa" />
    </>
  );
}

export function SekcjaKursow({ sekcja, onOdswiez }: { sekcja: Sekcja<KursProwadzacego[]> } & WspolneSekcji) {
  if (sekcja.stan === "awaria") return <AwariaSekcji nazwa="moje kursy" rodzaj={sekcja.rodzaj} onOdswiez={onOdswiez} />;
  const kursy = sekcja.dane;
  const wiersze: WierszRecordList[] = kursy.slice(0, LIMIT_WIERSZY).map((kurs) => ({
    id: `kurs-${kurs.id}`,
    tytul: kurs.title,
    akcja: { etykieta: "Otwórz kurs", href: `${ADRES_KURSOW}/${kurs.id}` },
  }));
  return (
    <>
      <RecordList
        tytul={`Moje kursy: ${kursy.length}`}
        wiersze={wiersze}
        pusty={pusty("Nie masz przypisanych kursów", "Kursy do prowadzenia przypisuje administracja.", onOdswiez)}
      />
      <ResztaListy pokazano={wiersze.length} razem={kursy.length} nazwa="kursów" href={ADRES_KURSOW} etykieta="Wszystkie kursy" />
    </>
  );
}
