import type { PytanieTestu } from "../dane";

/**
 * Atrapy ekranu „Pytania testu”: test końcowy kursu „Pierwsza pomoc
 * psychologiczna” (te same pytania co w atrapach testu uczestnika), z kluczem
 * odpowiedzi poprawnych. Dane przykładowe, bez prawdziwych osób.
 */

export const ID_TESTU = 10;

export function pytania(): PytanieTestu[] {
  return [
    {
      id: 41,
      body: "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?",
      sequence_order: 1,
      answers: [
        { id: 210, body: "Zadbanie o bezpieczeństwo i spokojne nawiązanie kontaktu", is_correct: true },
        { id: 211, body: "Ocena, kto ponosi winę za sytuację", is_correct: false },
      ],
    },
    {
      id: 42,
      body: "Która postawa wspiera rozmowę, która nie ocenia?",
      sequence_order: 2,
      answers: [
        { id: 220, body: "Uważne słuchanie i parafraza", is_correct: true },
        { id: 221, body: "Szybkie udzielanie rad", is_correct: false },
      ],
    },
    {
      id: 43,
      body: "Kiedy trzeba wezwać pomoc?",
      sequence_order: 3,
      answers: [
        { id: 230, body: "Gdy zagrożone jest życie lub zdrowie", is_correct: true },
        { id: 231, body: "Nigdy, rozmowa zawsze wystarcza", is_correct: false },
        { id: 232, body: "Tylko na prośbę rodziny", is_correct: false },
      ],
    },
  ];
}
