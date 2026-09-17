import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/h20/labels";

/**
 * Rejestr zdarzeń audytu (H20): zaplecze zapisuje zdarzenie
 * `internship.rejected` (odrzucenie wpisu stażu), ale interfejs go nie znał —
 * ani w słowniku zdarzeń (`AUDIT_ACTIONS`), ani w słowniku etykiet
 * (`ACTION_LABELS`). Bez wpisu w `AUDIT_ACTIONS` pozycja nie trafia do listy
 * filtra w `AuditLogView` (ta buduje opcje z `AUDIT_ACTIONS.map(...)`).
 *
 * Poza samym wpisem test pilnuje własności ważniejszej niż pojedyncza
 * literka: że oba słowniki się nie rozjeżdżają w żadną stronę. Rozjazd w
 * jedną stronę (zdarzenie bez etykiety) już się zdarzył i był niewidoczny,
 * bo widok ma ciche zejście awaryjne na surową nazwę zdarzenia. Rozjazd w
 * drugą stronę (etykieta bez zdarzenia na liście filtra) jest równie
 * możliwy — np. po usunięciu zdarzenia z `AUDIT_ACTIONS` bez sprzątnięcia
 * `ACTION_LABELS` — i tak samo cichy, więc obie strony muszą mieć osobne
 * asercje o osobnych komunikatach porażki.
 */
describe("rejestr zdarzeń audytu: internship.rejected", () => {
  it("AUDIT_ACTIONS zawiera dokładnie jedno zdarzenie odrzucenia wpisu stażu", () => {
    const wystapienia = AUDIT_ACTIONS.filter(
      (action) => action === "internship.rejected",
    );
    expect(wystapienia).toHaveLength(1);
  });

  it("ACTION_LABELS ma czytelną polską etykietę dla internship.rejected (nie surową nazwę)", () => {
    const etykieta = ACTION_LABELS["internship.rejected"];
    expect(etykieta).toBe("Wpis stażu odrzucony");
    expect(etykieta).not.toBe("internship.rejected");
  });

  it("AUDIT_ACTIONS nie ma duplikatów (inaczej sprawdzenie 1:1 z etykietami nic nie znaczy)", () => {
    const unikalne = new Set(AUDIT_ACTIONS);
    expect(unikalne.size).toBe(AUDIT_ACTIONS.length);
  });

  it("każde zdarzenie z AUDIT_ACTIONS ma etykietę w ACTION_LABELS (filtr nie zejdzie na surową nazwę)", () => {
    const bezEtykiety = AUDIT_ACTIONS.filter(
      (action) => !ACTION_LABELS[action],
    );
    expect(bezEtykiety).toEqual([]);
  });

  it("każda etykieta z ACTION_LABELS odpowiada zdarzeniu obecnemu w AUDIT_ACTIONS (bez martwych wpisów)", () => {
    const zbiorZdarzen = new Set<string>(AUDIT_ACTIONS);
    const etykietyBezZdarzenia = Object.keys(ACTION_LABELS).filter(
      (klucz) => !zbiorZdarzen.has(klucz),
    );
    expect(etykietyBezZdarzenia).toEqual([]);
  });

  it("oba słowniki mają taką samą liczbę wpisów (spójność 1:1)", () => {
    expect(Object.keys(ACTION_LABELS).length).toBe(AUDIT_ACTIONS.length);
  });
});
