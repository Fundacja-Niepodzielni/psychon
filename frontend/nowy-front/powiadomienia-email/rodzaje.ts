/**
 * Rodzaje powiadomień pokazywane na ekranie ustawień: karty według obszaru,
 * nazwa po polsku i jedno zdanie „kto dostaje”. Kody to wartości
 * `NotificationSettings::TYPES` na zapleczu (kontrakt §3.1); zdania wynikają z
 * miejsc, w których zaplecze wywołuje `Notify::send` dla danego kodu.
 *
 * Karta pokazuje wyłącznie te rodzaje, które zwróciło zaplecze — front niczego
 * nie dopisuje. Rodzaj spoza tej listy trafia do karty „Pozostałe” pod nazwą
 * ogólną (patrz `PowiadomieniaEmail.tsx`).
 */
export interface RodzajPowiadomienia {
  kod: string;
  nazwa: string;
  kto: string;
}

export interface KartaRodzajow {
  tytul: string;
  rodzaje: RodzajPowiadomienia[];
  /** Karta niesie blok przypomnienia o superwizji (`supervision.reminder`, poza `types`). */
  zPrzypomnieniem?: boolean;
}

export const OPIS_PRZYPOMNIENIA_SUPERWIZJI = {
  nazwa: "Przypomnienie o superwizji",
  kto: "Dostaje osoba zapisana na superwizję, której termin wypada następnego dnia.",
};

export const KARTY_RODZAJOW: KartaRodzajow[] = [
  {
    tytul: "Rekrutacja",
    rodzaje: [
      {
        kod: "application.accepted",
        nazwa: "Zgłoszenie zaakceptowane",
        kto: "Dostaje osoba, której zgłoszenie do programu zaakceptowano.",
      },
      {
        kod: "application.rejected",
        nazwa: "Zgłoszenie odrzucone — notatka dla administracji",
        kto: "Dostaje osoba z administracji, która odrzuciła zgłoszenie; wiadomość z powodem do kandydata wychodzi zawsze.",
      },
    ],
  },
  {
    tytul: "Kursy i testy",
    rodzaje: [
      {
        kod: "assignment.created",
        nazwa: "Przypisanie prowadzącego",
        kto: "Dostaje osoba prowadząca, którą przypisano do kursu lub lekcji.",
      },
      {
        kod: "assignment.removed",
        nazwa: "Odebranie przypisania prowadzącego",
        kto: "Dostaje osoba prowadząca, której odebrano przypisanie do kursu lub lekcji.",
      },
      {
        kod: "course.invited",
        nazwa: "Zaproszenie na kurs",
        kto: "Dostaje każda osoba zaproszona na kurs spoza głównej ścieżki.",
      },
      {
        kod: "course.unlocked",
        nazwa: "Odblokowanie etapu",
        kto: "Dostaje osoba, której odblokował się kolejny etap ścieżki kursów (raz na etap).",
      },
      {
        kod: "attempt.failed_final",
        nazwa: "Wyczerpane podejścia do testu",
        kto: "Dostają opiekunowie projektu, gdy ktoś nie zaliczy testu w ostatnim dostępnym podejściu.",
      },
    ],
  },
  {
    tytul: "Pytania do prowadzących",
    rodzaje: [
      {
        kod: "question.asked",
        nazwa: "Nowe pytanie do lekcji",
        kto: "Dostaje osoba prowadząca przypisana do lekcji (albo do kursu); bez przypisania nikt.",
      },
      {
        kod: "question.answered",
        nazwa: "Odpowiedź na pytanie",
        kto: "Dostaje osoba, która zadała pytanie, gdy prowadzący na nie odpowie.",
      },
    ],
  },
  {
    tytul: "Staż",
    rodzaje: [
      {
        kod: "internship.accepted",
        nazwa: "Wpis stażu zaakceptowany",
        kto: "Dostaje osoba, której wpis stażu zaakceptowano.",
      },
      {
        kod: "internship.returned",
        nazwa: "Wpis stażu do poprawy",
        kto: "Dostaje osoba, której wpis stażu odesłano do poprawy.",
      },
      {
        kod: "internship.rejected",
        nazwa: "Wpis stażu odrzucony",
        kto: "Dostaje osoba, której wpis stażu odrzucono.",
      },
    ],
  },
  {
    tytul: "Superwizje",
    zPrzypomnieniem: true,
    rodzaje: [
      {
        kod: "supervision.slot_cancelled",
        nazwa: "Termin superwizji odwołany",
        kto: "Dostają osoby zapisane na odwołany termin oraz prowadzący ten termin.",
      },
    ],
  },
  {
    tytul: "Certyfikat i dokumenty",
    rodzaje: [
      {
        kod: "certificate.ready",
        nazwa: "Certyfikat gotowy",
        kto: "Dostaje osoba, której wydano certyfikat ukończenia programu.",
      },
      {
        kod: "document.ready",
        nazwa: "Dokument gotowy",
        kto: "Dostaje osoba, dla której wygenerowano dokument (porozumienie, zaświadczenie o stażu).",
      },
    ],
  },
  {
    tytul: "Profil psychologa",
    rodzaje: [
      {
        kod: "profile.accepted",
        nazwa: "Profil psychologa zaakceptowany",
        kto: "Dostaje osoba, której wniosek o wpis do bazy psychologów zaakceptowano.",
      },
      {
        kod: "profile.returned",
        nazwa: "Profil psychologa do poprawy",
        kto: "Dostaje osoba, której wniosek o wpis do bazy psychologów odesłano do poprawy.",
      },
      {
        kod: "profile.withdrawn",
        nazwa: "Zgoda na publikację profilu wycofana",
        kto: "Dostają opiekunowie projektu i administracja, gdy ktoś wycofa zgodę na publikację swojego profilu.",
      },
    ],
  },
  {
    tytul: "Współpraca po programie",
    rodzaje: [
      {
        kod: "cooperation_request.answered",
        nazwa: "Odpowiedź na zgłoszenie dalszej współpracy",
        kto: "Dostaje osoba, która złożyła zgłoszenie dalszej współpracy, gdy administracja na nie odpowie.",
      },
    ],
  },
  {
    tytul: "Konto",
    rodzaje: [
      {
        kod: "export.ready",
        nazwa: "Eksport danych gotowy",
        kto: "Dostaje osoba, która zleciła eksport swoich danych, gdy plik jest gotowy do pobrania.",
      },
    ],
  },
];
