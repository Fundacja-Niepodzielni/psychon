/**
 * Jedno deklaratywne źródło przełączenia ekranów nowego frontu na trasy
 * produktu (bez `nowy-front` w adresie). Rejestr menu (`frontend/lib/menu/*`)
 * czyta stąd cel wpisu — żadna trasa nie jest wpisana na sztywno w dwóch
 * miejscach naraz.
 *
 * Kształt: grupa → { stara trasa, nowa trasa produktu, włączona: tak/nie }.
 * Jedna grupa może nieść więcej niż jeden ekran (np. ekran uczestnika i
 * ekran administracji tej samej funkcji) — stąd `ekrany: EkranGrupy[]`,
 * każdy z własnym panelem i własną parą tras, pod jedną wspólną flagą
 * `wlaczona`.
 *
 * Rejestr zna każdy ekran, który stoi dziś pod segmentem nowego frontu
 * (`app/nowy-front/**\/page.tsx`) — pilnuje tego test w tym katalogu. Grupa
 * wyłączona nie zmienia niczego: menu, trasy i strony starego frontu są
 * bit w bit takie, jakby rejestru nie było.
 *
 * Dwa sposoby przełączenia ekranu, wybierane samą parą tras:
 * - stara trasa różna od nowej — stara strona przekierowuje na nową
 *   (bez 404), nowa strona żyje w grupie tras `(przelaczenie)`;
 * - stara trasa równa nowej — adres się nie zmienia, strona pod tym adresem
 *   zamienia treść na ekran nowego frontu;
 * - stara trasa `null` — funkcji dotąd w produkcie nie było, powstaje tylko
 *   nowa trasa i wpis menu.
 */

/**
 * Panel, w którym stoi ekran grupy — nazwa zgodna z katalogami `app/`.
 * `publiczny` to strony bez powłoki panelu i bez menu (logowanie, konto, publiczny
 * certyfikat, dokumenty): ekran nowego frontu niesie własną stopkę z szablonu strony
 * publicznej, więc dawna stopka układu głównego chowa się pod adresem włączonej grupy
 * tego panelu (`components/layout/PublicFooter.tsx`).
 */
export type NazwaPanelu = "uczestnik" | "administracja" | "prowadzacy" | "publiczny";

/** Jeden ekran należący do grupy: para tras w jednym panelu. */
export interface EkranGrupy {
  /** Panel, którego menu ma nieść wpis do tego ekranu. */
  panel: NazwaPanelu;
  /**
   * Stara trasa produktu tej samej funkcji, albo `null`, gdy funkcji dotąd
   * w produkcie nie było (wpis menu i trasa są zupełnie nowe — grupa off
   * znaczy wtedy "wpisu jeszcze nie ma", nie "wpis wskazuje starą trasę").
   */
  staraTrasa: string | null;
  /** Nowa trasa produktu nowego ekranu (bez `nowy-front` w adresie). */
  nowaTrasa: string;
  /**
   * Dzisiejsza trasa ekranu pod segmentem nowego frontu (adres strony
   * `app/nowy-front/**\/page.tsx`). Po przełączeniu ta trasa zostaje na
   * miejscu; rejestr trzyma ją po to, by żaden ekran nie został poza mapą.
   */
  trasaPoligonu: string;
}

/** Jedna grupa przełączenia: zbiór ekranów pod wspólną flagą włączenia. */
export interface DefinicjaGrupy {
  klucz: string;
  wlaczona: boolean;
  ekrany: EkranGrupy[];
}

/**
 * Grupy dzisiejszego kanonu. Włączonych jest trzydzieści trzy: `wspolpraca`, `pulpitUczestnika`, `lekcja`, `kursUczestnika`, `pytaniaTestu`, `testUczestnika`, `certyfikat`, `dokumentyUczestnika`, `dziennikStazu`, `superwizjaUczestnika`, `profilPsychologa`, `formyStazu`,
 * strony publiczne pod tymi samymi adresami: `aktywacjaKonta`, `dostepWygasl`, `twojeKonto`,
 * `pulpitAdministracji`, `pulpitProwadzacego`, `decyzjaProfilu`, `wzoryDokumentow`, `ekranStartowy`, `sprawy`, `kolejkaStazu`, `kursyAdministracji`,
 * `kursAdministracji`, `publikacjaKursu`, `zaproszeniaNaKurs` (te trzy dzielą trasę `/admin/kursy/[id]`: publikacja
 * i zaproszenia są sekcjami ekranu kursu, więc włącza się je tylko razem z nim), `edycjaLekcji` (ekran lekcji
 * pod własnym adresem z kursem w ścieżce; wchodzi się na niego z ekranu kursu), `nabor` i `listaOsob`
 * (te dwie dzielą trasę `/admin/uczestniczki` i włącza się je tylko razem), `kartaOsoby`, `powiadomienia` (ten sam adres `/admin/emails`: treść strony zamienia się na ekran „Powiadomienia”)
 * oraz `certyfikaty` i `czasNauki` (lista certyfikatów i czas nauki administracji pod dotychczasowymi adresami;
 * `certyfikaty` to inna grupa niż `certyfikat` uczestnika). Grupa `logowanie` jest wyłączona: jej ekrany działają pod ścieżką podglądu.
 * Pozostałe mają tu jeszcze
 * tylko opis docelowej pary tras: stronę pod nową trasą, wpis menu i
 * zamianę treści starej strony dokłada dopiero zmiana, która daną grupę
 * włącza — test w tym katalogu nie pozwala włączyć grupy bez nich.
 */
export const GRUPY = {
  /**
   * Zgłoszenia dalszej współpracy (H01) — uczestnik `po-programie` (dziś
   * `/panel/po-programie`, ekran statusu programu bez formularza) oraz
   * administracja (funkcji w starym froncie nie było).
   */
  wspolpraca: {
    klucz: "wspolpraca",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/po-programie",
        nowaTrasa: "/panel/dalsza-wspolpraca",
        trasaPoligonu: "/nowy-front/po-programie",
      },
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/zgloszenia-wspolpracy",
        trasaPoligonu: "/nowy-front/admin/zgloszenia-wspolpracy",
      },
    ],
  },
  /** Słownik form stażu (H11) — administracja, funkcji dotąd nie było. */
  formyStazu: {
    klucz: "formyStazu",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/formy-stazu",
        trasaPoligonu: "/nowy-front/admin/formy-stazu",
      },
    ],
  },
  /**
   * Skrzynka e-maili z ustawieniami powiadomień (H16) — ten sam adres co
   * dzisiejsza skrzynka, treść strony zamienia się na ekran nowego frontu.
   */
  powiadomienia: {
    klucz: "powiadomienia",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/emails",
        nowaTrasa: "/admin/emails",
        trasaPoligonu: "/nowy-front/admin/powiadomienia",
      },
    ],
  },
  /**
   * Terminy superwizji z edycją i odwołaniem (H12) — ten sam adres co
   * dzisiejsza lista terminów administracji.
   */
  superwizje: {
    klucz: "superwizje",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/superwizje",
        nowaTrasa: "/admin/superwizje",
        trasaPoligonu: "/nowy-front/admin/superwizje",
      },
    ],
  },
  /**
   * Kurs: tematy i lekcje (H08) — ten sam ekran co kurs administracji
   * (`nowy-front/kurs-administracji/`) w roli prowadzącego, dane z tras
   * `/instructor/…`; ten sam adres co dzisiejszy szczegół kursu prowadzącego.
   * Drugi ekran: strona lekcji prowadzącego pod adresem z kursem w ścieżce —
   * bez starej trasy, bo w starym froncie lekcję edytowało się na stronie kursu.
   */
  kurs: {
    klucz: "kurs",
    wlaczona: false,
    ekrany: [
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy/kursy/[id]",
        nowaTrasa: "/prowadzacy/kursy/[id]",
        trasaPoligonu: "/nowy-front/kurs/[id]",
      },
      {
        panel: "prowadzacy",
        staraTrasa: null,
        nowaTrasa: "/prowadzacy/kursy/[id]/lekcje/[idLekcji]",
        trasaPoligonu: "/nowy-front/kurs/[id]",
      },
    ],
  },
  /** Pulpit uczestnika — ten sam adres co dzisiejszy pulpit, treść strony zamienia się na ekran nowego frontu. */
  pulpitUczestnika: {
    klucz: "pulpitUczestnika",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/pulpit",
        nowaTrasa: "/panel/pulpit",
        trasaPoligonu: "/nowy-front/pulpit",
      },
    ],
  },
  /**
   * Lekcja uczestnika — ten sam adres co dzisiejsza lekcja, treść strony zamienia się na ekran nowego frontu.
   * Włączona: `panel/lekcje/[id]/page.tsx` rysuje ekran lekcji nowego frontu w ramce uczestnika, a nagranie gra
   * w prawdziwym odtwarzaczu (`RecordingPlayer`), który liczy czas aktywny z komunikatów odtwarzacza dostawcy.
   * Zielony przycisk ukończenia jest zawsze widoczny; gdy nagranie jest niedostępne albo w przygotowaniu, ekran
   * mówi o tym jednym zdaniem, a lekcja bez nagrania da się ukończyć tak jak dotąd.
   */
  lekcja: {
    klucz: "lekcja",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/lekcje/[id]",
        nowaTrasa: "/panel/lekcje/[id]",
        trasaPoligonu: "/nowy-front/lekcja/[id]",
      },
    ],
  },
  /**
   * Strona kursu uczestnika — ten sam adres co dzisiejsza strona kursu, treść strony zamienia się na ekran
   * nowego frontu. Włączona razem z grupą `lekcja`: oba ekrany prowadzą do siebie nawzajem (z kursu do lekcji
   * i z lekcji z powrotem do kursu). Strona `panel/kursy/[slug]/page.tsx` jest podpięta pod tę flagę, a dawna
   * treść strony zostaje w `StaraTresc.tsx`.
   */
  kursUczestnika: {
    klucz: "kursUczestnika",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/kursy/[slug]",
        nowaTrasa: "/panel/kursy/[slug]",
        trasaPoligonu: "/nowy-front/kurs-uczestnika/[slug]",
      },
    ],
  },
  /**
   * Superwizja osoby wolontariackiej (H12): zapisy na terminy i obecność — ten sam adres co dzisiejsza
   * strona `/panel/superwizja`, treść strony zamienia się na ekran nowego frontu (`StaraTresc.tsx` niesie
   * dawną treść). Bramka roli `volunteer` zostaje w układzie trasy. To nie jest grupa `superwizje`
   * (terminy superwizji w administracji).
   */
  superwizjaUczestnika: {
    klucz: "superwizjaUczestnika",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/superwizja",
        nowaTrasa: "/panel/superwizja",
        trasaPoligonu: "/nowy-front/superwizja",
      },
    ],
  },
  /**
   * Profil psychologa wolontariusza (H15) — ten sam adres co dzisiejszy formularz wniosku, treść strony zamienia się
   * na ekran nowego frontu. Strona `panel/profil-psychologa/page.tsx` jest podpięta pod tę flagę, dawna treść zostaje
   * w `StaraTresc.tsx`, a strażnik roli `volunteer` w układzie tej trasy obejmuje obie treści.
   */
  profilPsychologa: {
    klucz: "profilPsychologa",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/profil-psychologa",
        nowaTrasa: "/panel/profil-psychologa",
        trasaPoligonu: "/nowy-front/profil-psychologa",
      },
    ],
  },
  /**
   * Dziennik stażu osoby wolontariackiej (H11) — ten sam adres co dzisiejszy dziennik, treść strony zamienia się
   * na ekran nowego frontu (te same trzy żądania do `/internship/entries`).
   */
  dziennikStazu: {
    klucz: "dziennikStazu",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/staz",
        nowaTrasa: "/panel/staz",
        trasaPoligonu: "/nowy-front/staz",
      },
    ],
  },
  /**
   * Certyfikat ukończenia programu (H13) — uczestnik; ten sam adres co
   * dzisiejszy ekran certyfikatu, treść strony zamienia się na ekran nowego frontu.
   */
  certyfikat: {
    klucz: "certyfikat",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/certyfikat",
        nowaTrasa: "/panel/certyfikat",
        trasaPoligonu: "/nowy-front/certyfikat",
      },
    ],
  },
  /**
   * Dokumenty uczestnika (H14) — lista wydanych dokumentów i dokumenty do
   * wygenerowania; ten sam adres co dzisiejszy ekran dokumentów.
   */
  dokumentyUczestnika: {
    klucz: "dokumentyUczestnika",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/dokumenty",
        nowaTrasa: "/panel/dokumenty",
        trasaPoligonu: "/nowy-front/dokumenty",
      },
    ],
  },
  /**
   * Test końcowy kursu uczestnika — ten sam adres co dzisiejszy test kursu, treść strony zamienia się na ekran
   * nowego frontu. Wchodzi się na niego z ekranu kursu („Przejdź do testu”). Strona
   * `panel/kursy/[slug]/test/page.tsx` jest podpięta pod tę flagę, a dawna treść strony zostaje w `StaraTresc.tsx`.
   */
  testUczestnika: {
    klucz: "testUczestnika",
    wlaczona: true,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/kursy/[slug]/test",
        nowaTrasa: "/panel/kursy/[slug]/test",
        trasaPoligonu: "/nowy-front/kurs-uczestnika/[slug]/test",
      },
    ],
  },
  /**
   * Pytania testu końcowego (H10) — ten sam adres co dzisiejszy bank pytań,
   * w obu panelach pod jedną flagą: ten sam ekran, administracja na trasach
   * `/admin/…`, prowadzący na trasach `/instructor/…` (pytania testu swojego
   * kursu). Wchodzi się z ekranu kursu (parametr `kurs` prowadzi okruszek
   * z powrotem do kursu).
   */
  pytaniaTestu: {
    klucz: "pytaniaTestu",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/testy/[id]/pytania",
        nowaTrasa: "/admin/testy/[id]/pytania",
        trasaPoligonu: "/nowy-front/admin/testy/[id]/pytania",
      },
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy/testy/[id]/pytania",
        nowaTrasa: "/prowadzacy/testy/[id]/pytania",
        trasaPoligonu: "/nowy-front/prowadzacy/testy/[id]/pytania",
      },
    ],
  },
  /** Pulpit prowadzącego — ten sam adres co dzisiejsza strona startowa prowadzącego. */
  pulpitProwadzacego: {
    klucz: "pulpitProwadzacego",
    wlaczona: true,
    ekrany: [
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy",
        nowaTrasa: "/prowadzacy",
        trasaPoligonu: "/nowy-front/prowadzacy",
      },
    ],
  },
  /** Pulpit administracji — ten sam adres co dzisiejsza strona startowa administracji. */
  pulpitAdministracji: {
    klucz: "pulpitAdministracji",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin",
        nowaTrasa: "/admin",
        trasaPoligonu: "/nowy-front/admin/pulpit",
      },
    ],
  },
  /** Sprawy administracji — ten sam adres co dzisiejsza kolejka spraw. */
  sprawy: {
    klucz: "sprawy",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/sprawy",
        nowaTrasa: "/admin/sprawy",
        trasaPoligonu: "/nowy-front/admin/sprawy",
      },
    ],
  },
  /** Lista kursów administracji z kolejnością ścieżki — ten sam adres co dzisiejsza lista kursów. */
  kursyAdministracji: {
    klucz: "kursyAdministracji",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/kursy",
        nowaTrasa: "/admin/kursy",
        trasaPoligonu: "/nowy-front/admin/kursy",
      },
    ],
  },
  /** Karta osoby w administracji — ten sam adres co dzisiejsza karta uczestnika. */
  kartaOsoby: {
    klucz: "kartaOsoby",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/uczestniczki/[id]",
        nowaTrasa: "/admin/uczestniczki/[id]",
        trasaPoligonu: "/nowy-front/admin/uczestniczki/[id]",
      },
    ],
  },
  /**
   * Publikacja kursu w administracji — ten sam adres co dzisiejszy szczegół kursu.
   * Publikacja jest sekcją ekranu kursu (`/admin/kursy/[id]`), nie osobną trasą.
   */
  publikacjaKursu: {
    klucz: "publikacjaKursu",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/kursy/[id]",
        nowaTrasa: "/admin/kursy/[id]",
        trasaPoligonu: "/nowy-front/admin/kursy/[id]/publikacja",
      },
    ],
  },
  /**
   * Nabór rekrutacyjny (H03): lista zgłoszeń (dziś zakładka „Zgłoszenia” pod
   * `/admin/uczestniczki`, stąd stara trasa listy) i szczegół zgłoszenia (w starym
   * froncie bez osobnej strony). Lista stoi w tablicy pierwsza: wpis menu administracji
   * czyta pierwszy ekran panelu, a menu ma prowadzić na listę, nie na szczegół.
   * Stara trasa listy jest też trasą grupy `listaOsob`, więc strona pod nią NIE
   * przekierowuje w całości — po włączeniu grupy tylko jej zakładka „Zgłoszenia”
   * prowadzi na nową trasę listy.
   */
  nabor: {
    klucz: "nabor",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/uczestniczki",
        nowaTrasa: "/admin/nabor",
        trasaPoligonu: "/nowy-front/admin/zgloszenia",
      },
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/nabor/[id]",
        trasaPoligonu: "/nowy-front/admin/zgloszenia/[id]",
      },
    ],
  },
  /** Decyzja o wniosku o profil psychologa (H15) — ten sam adres co dzisiejszy szczegół wniosku. */
  decyzjaProfilu: {
    klucz: "decyzjaProfilu",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/profile/[id]",
        nowaTrasa: "/admin/profile/[id]",
        trasaPoligonu: "/nowy-front/admin/profile/[id]",
      },
    ],
  },
  /**
   * Nowe konto poza rekrutacją (H18) — funkcji w starym froncie nie ma; ekran ma
   * własny adres przy liście osób (dotąd ten adres trafiał do karty osoby).
   */
  noweKonto: {
    klucz: "noweKonto",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/uczestniczki/nowa",
        nowaTrasa: "/admin/uczestniczki/nowa",
        trasaPoligonu: "/nowy-front/admin/osoby/nowa",
      },
    ],
  },
  /**
   * Zaproszenia na kurs (H08) — panel zaproszeń w ustawieniach kursu, ten sam adres
   * co szczegół kursu. Grupa jest włączona, ale sam panel jest dziś ukryty stałą
   * `ZAPROSZENIA_W_USTAWIENIACH` w `nowy-front/kurs-administracji/KolumnaBoczna.tsx`
   * do czasu zaproszeń po MVP; kod panelu i trasa robocza zostają. Pokazanie panelu
   * to zmiana tej stałej (nowy ekran po odbiorze), nie tego przełącznika.
   */
  zaproszeniaNaKurs: {
    klucz: "zaproszeniaNaKurs",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/kursy/[id]",
        nowaTrasa: "/admin/kursy/[id]",
        trasaPoligonu: "/nowy-front/admin/kursy/[id]/zaproszenia",
      },
    ],
  },
  /** Wzory dokumentów z wersjami (H14) — ten sam adres co dzisiejszy ekran wzorów. */
  wzoryDokumentow: {
    klucz: "wzoryDokumentow",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/wzory-dokumentow",
        nowaTrasa: "/admin/wzory-dokumentow",
        trasaPoligonu: "/nowy-front/admin/wzory-dokumentow",
      },
    ],
  },
  /**
   * Ustawienia roku programu (H19) — ten sam adres co dzisiejsze ustawienia edycji.
   * Zostaje wyłączona: stara strona zmienia też nazwę edycji, daty rozpoczęcia i
   * zakończenia oraz limit miejsc (`PATCH /admin/edition`), a nowy ekran pokazuje
   * tylko sześć progów z kontraktu §3.3 — bez odpowiednika tych czterech pól
   * administracja nie mogłaby ich zmienić z panelu. Strona `ustawienia/page.tsx`
   * jest już podpięta pod tę flagę.
   */
  ustawieniaProgramu: {
    klucz: "ustawieniaProgramu",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/ustawienia",
        nowaTrasa: "/admin/ustawienia",
        trasaPoligonu: "/nowy-front/admin/ustawienia",
      },
    ],
  },
  /** Redakcja ekranu startowego (H21) — ten sam adres co dzisiejsza redakcja treści. */
  ekranStartowy: {
    klucz: "ekranStartowy",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/ekran-startowy",
        nowaTrasa: "/admin/ekran-startowy",
        trasaPoligonu: "/nowy-front/admin/ekran-startowy",
      },
    ],
  },
  /**
   * Edycja lekcji: treść, nagranie, materiały (H08). Osobny ekran pod własnym
   * adresem z kursem w ścieżce — bez starej trasy, bo w starym froncie lekcję
   * edytowało się na stronie kursu. Wchodzi się na niego z ekranu kursu
   * odnośnikiem „Materiały i nagranie” w formularzu przy wierszu lekcji.
   */
  edycjaLekcji: {
    klucz: "edycjaLekcji",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/kursy/[id]/lekcje/[idLekcji]",
        trasaPoligonu: "/nowy-front/admin/lekcje/[id]",
      },
    ],
  },
  /**
   * Kurs administracji: tematy i lekcje, publikacja, zaproszenia i usunięcie
   * na jednym ekranie (H08) — ten sam adres co dzisiejszy szczegół kursu.
   */
  kursAdministracji: {
    klucz: "kursAdministracji",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/kursy/[id]",
        nowaTrasa: "/admin/kursy/[id]",
        trasaPoligonu: "/nowy-front/admin/kursy/[id]",
      },
    ],
  },
  /** Lista osób w administracji — ten sam adres co dzisiejsza strona osób (zakładka „Osoby”). */
  listaOsob: {
    klucz: "listaOsob",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/uczestniczki",
        nowaTrasa: "/admin/uczestniczki",
        trasaPoligonu: "/nowy-front/admin/uczestniczki",
      },
    ],
  },
  /** Kolejka wniosków o profil psychologa (H15) — ten sam adres co dzisiejsza kolejka. */
  kolejkaProfili: {
    klucz: "kolejkaProfili",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/profile",
        nowaTrasa: "/admin/profile",
        trasaPoligonu: "/nowy-front/admin/profile",
      },
    ],
  },
  /** Kolejka wpisów stażu do akceptacji (H11) — ten sam adres co dzisiejsza kolejka. */
  kolejkaStazu: {
    klucz: "kolejkaStazu",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/staz",
        nowaTrasa: "/admin/staz",
        trasaPoligonu: "/nowy-front/admin/staz",
      },
    ],
  },
  /** Lista wydanych certyfikatów z unieważnianiem (H13, administracja) — ten sam adres co dzisiejsza lista. */
  certyfikaty: {
    klucz: "certyfikaty",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/certyfikaty",
        nowaTrasa: "/admin/certyfikaty",
        trasaPoligonu: "/nowy-front/admin/certyfikaty",
      },
    ],
  },
  /**
   * Czas nauki i rzetelność osób (H07) — ten sam adres co dzisiejszy ekran. Widok
   * jednej osoby to parametr `?osoba=<numer>` na tej samej stronie, bez osobnej trasy.
   */
  czasNauki: {
    klucz: "czasNauki",
    wlaczona: true,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/czas-nauki",
        nowaTrasa: "/admin/czas-nauki",
        trasaPoligonu: "/nowy-front/admin/czas-nauki",
      },
    ],
  },
  /** Lista kursów prowadzącego — ten sam adres co dzisiejsza lista kursów prowadzącego. */
  kursyProwadzacego: {
    klucz: "kursyProwadzacego",
    wlaczona: false,
    ekrany: [
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy/kursy",
        nowaTrasa: "/prowadzacy/kursy",
        trasaPoligonu: "/nowy-front/prowadzacy/kursy",
      },
    ],
  },
  /** Skrzynka pytań prowadzącego (H17) — ten sam adres co dzisiejsza skrzynka. */
  skrzynkaPytan: {
    klucz: "skrzynkaPytan",
    wlaczona: false,
    ekrany: [
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy/pytania",
        nowaTrasa: "/prowadzacy/pytania",
        trasaPoligonu: "/nowy-front/prowadzacy/pytania",
      },
    ],
  },
  /**
   * Logowanie i jego trzy ekrany pośrednie (wybór konta po logowaniu, konto niepowiązane, konto
   * zablokowane) — te same adresy co dziś, treść stron zamienia się na ekrany nowego frontu na szablonie
   * strony publicznej. Dawna treść stron zostaje w `StaraTresc.tsx` obok każdej `page.tsx`.
   * Grupa wyłączona, dopóki ekranów nie sprawdzi bieg z prawdziwym logowaniem: pod czterema adresami
   * zostają dawne strony (z dawną stopką), a nowe ekrany działają pod ścieżką podglądu.
   */
  logowanie: {
    klucz: "logowanie",
    wlaczona: false,
    ekrany: [
      {
        panel: "publiczny",
        staraTrasa: "/logowanie",
        nowaTrasa: "/logowanie",
        trasaPoligonu: "/nowy-front/publiczne/logowanie",
      },
      {
        panel: "publiczny",
        staraTrasa: "/logowanie/konta",
        nowaTrasa: "/logowanie/konta",
        trasaPoligonu: "/nowy-front/publiczne/logowanie/konta",
      },
      {
        panel: "publiczny",
        staraTrasa: "/logowanie/niepowiazane",
        nowaTrasa: "/logowanie/niepowiazane",
        trasaPoligonu: "/nowy-front/publiczne/logowanie/niepowiazane",
      },
      {
        panel: "publiczny",
        staraTrasa: "/logowanie/zablokowane",
        nowaTrasa: "/logowanie/zablokowane",
        trasaPoligonu: "/nowy-front/publiczne/logowanie/zablokowane",
      },
    ],
  },
  /** Aktywacja konta z zaproszenia — ten sam adres `/aktywacja`, treść strony zamienia się na ekran nowego frontu. */
  aktywacjaKonta: {
    klucz: "aktywacjaKonta",
    wlaczona: true,
    ekrany: [
      {
        panel: "publiczny",
        staraTrasa: "/aktywacja",
        nowaTrasa: "/aktywacja",
        trasaPoligonu: "/nowy-front/publiczne/aktywacja",
      },
    ],
  },
  /** Komunikat o wygasłym dostępie — ten sam adres `/dostep-wygasl`, treść strony zamienia się na ekran nowego frontu. */
  dostepWygasl: {
    klucz: "dostepWygasl",
    wlaczona: true,
    ekrany: [
      {
        panel: "publiczny",
        staraTrasa: "/dostep-wygasl",
        nowaTrasa: "/dostep-wygasl",
        trasaPoligonu: "/nowy-front/publiczne/dostep-wygasl",
      },
    ],
  },
  /** Strona konta (tożsamość z logowania i wylogowanie) — ten sam adres `/konto`. */
  twojeKonto: {
    klucz: "twojeKonto",
    wlaczona: true,
    ekrany: [
      {
        panel: "publiczny",
        staraTrasa: "/konto",
        nowaTrasa: "/konto",
        trasaPoligonu: "/nowy-front/publiczne/konto",
      },
    ],
  },
} as const satisfies Record<string, DefinicjaGrupy>;

export type KluczGrupy = keyof typeof GRUPY;

/**
 * Cel wpisu menu dla ekranu grupy: stara trasa, dopóki grupa jest
 * wyłączona (bit w bit jak na bazie), nowa trasa produktu, gdy grupa jest
 * włączona. `null`, gdy wpisu menu dziś w ogóle nie ma (grupa wyłączona,
 * ekran bez starej trasy) — wołający ma wtedy pominąć wpis, nie wstawiać
 * pustego `href`.
 *
 * Funkcja jest czysta i przyjmuje `DefinicjaGrupy` wprost (nie tylko klucz
 * rejestru) — dzięki temu test może sprawdzić obie gałęzie flagi bez
 * mutowania współdzielonego singletona `GRUPY`.
 */
export function celTrasyEkranu(grupa: DefinicjaGrupy, panel: NazwaPanelu): string | null {
  const ekran = grupa.ekrany.find((e) => e.panel === panel);
  if (!ekran) return null;
  return grupa.wlaczona ? ekran.nowaTrasa : ekran.staraTrasa;
}

/** Wygoda dla wołających ze znanym kluczem rejestru `GRUPY`. */
export function celTrasy(klucz: KluczGrupy, panel: NazwaPanelu): string | null {
  return celTrasyEkranu(GRUPY[klucz], panel);
}

/**
 * Czy stara trasa ekranu ma po włączeniu grupy przekierować (a nie 404) —
 * prawda dokładnie wtedy, gdy ekran miał starą trasę RÓŻNĄ od nowej i grupa
 * jest włączona. Gdy adres się nie zmienia, strona zamienia treść zamiast
 * przekierowywać (przekierowanie na siebie samą byłoby pętlą). Woła to
 * strona starej trasy, nigdy sam rejestr menu.
 */
export function czyStaraTrasaPrzekierowuje(grupa: DefinicjaGrupy, panel: NazwaPanelu): boolean {
  const ekran = grupa.ekrany.find((e) => e.panel === panel);
  return (
    !!ekran && ekran.staraTrasa !== null && ekran.staraTrasa !== ekran.nowaTrasa && grupa.wlaczona
  );
}

/**
 * Czy nowa trasa produktu ma być osiągalna: dopiero po włączeniu grupy.
 * Wyłączona grupa zostawia adres tak, jak wyglądał na bazie (404), więc
 * strona w grupie tras `(przelaczenie)` woła to i przy fałszu kończy się
 * `notFound()`.
 */
export function czyNowaTrasaDostepna(grupa: DefinicjaGrupy): boolean {
  return grupa.wlaczona;
}
