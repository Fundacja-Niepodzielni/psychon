import type { DaneTestu, KursTestu, PodejscieZHistorii, WynikPodejscia } from "../dane";

/**
 * Atrapy ekranu testu końcowego. Kurs ten sam co w atrapach strony kursu
 * uczestnika („Pierwsza pomoc psychologiczna”, siedem lekcji), test z trzema
 * pytaniami. Dane przykładowe, bez prawdziwych osób.
 */

export const SLUG = "pierwsza-pomoc-psychologiczna";

export const KURS: KursTestu = { id: 2, title: "Pierwsza pomoc psychologiczna", has_test: true, nieukonczone: 0 };

export const PYTANIA = [
  {
    id: 41,
    body: "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?",
    answers: [
      { id: 210, body: "Zadbanie o bezpieczeństwo i spokojne nawiązanie kontaktu" },
      { id: 211, body: "Ocena, kto ponosi winę za sytuację" },
    ],
  },
  {
    id: 42,
    body: "Która postawa wspiera rozmowę, która nie ocenia?",
    answers: [
      { id: 220, body: "Uważne słuchanie i parafraza" },
      { id: 221, body: "Szybkie udzielanie rad" },
    ],
  },
  {
    id: 43,
    body: "Kiedy trzeba wezwać pomoc?",
    answers: [
      { id: 230, body: "Gdy zagrożone jest życie lub zdrowie" },
      { id: 231, body: "Nigdy, rozmowa zawsze wystarcza" },
    ],
  },
];

/** Odczyt testu; limit podejść celowo różny od 3 — pochodzi z ustawień edycji, nie jest stały. */
export function test(nadpisz: Partial<DaneTestu> = {}): DaneTestu {
  return { test_id: 10, pass_threshold: 70, attempts_used: 1, attempts_limit: 4, passed: false, questions: PYTANIA, ...nadpisz };
}

export function wynik(nadpisz: Partial<WynikPodejscia> = {}): WynikPodejscia {
  return { attempt_number: 2, score_percent: 100, passed: true, wrong_question_ids: [], ...nadpisz };
}

export const HISTORIA: PodejscieZHistorii[] = [
  { attempt_number: 1, score_percent: 33, passed: false, created_at: "2026-09-30T18:50:00Z" },
];

/** Historia osoby, która zaliczyła test w drugim podejściu. */
export const HISTORIA_ZALICZONA: PodejscieZHistorii[] = [
  ...HISTORIA,
  { attempt_number: 2, score_percent: 85, passed: true, created_at: "2026-10-01T09:15:00Z" },
];
