import { describe, expect, it } from "vitest";
import { ETYKIETY_EMAILI, etykietaEmaila, zmienionePreferencje, type PreferencjaEmail } from "../dane";

/**
 * Rodzaje e-maili, które osoba może wyłączyć (zaplecze:
 * `EmailTemplates::personSwitchable`, czyli e-maile „Osoba może wyłączyć
 * w Profilu” z treści e-maili). Każdy ma polską nazwę na karcie.
 */
const WYLACZALNE = [
  "access.expiring_7d",
  "assignment.created",
  "assignment.removed",
  "attempt.failed_final",
  "certificate.ready",
  "cooperation_request.answered",
  "cooperation_request.created",
  "course.invited",
  "course.unlocked",
  "document.ready",
  "export.ready",
  "internship.accepted",
  "internship.rejected",
  "internship.returned",
  "profile.accepted",
  "profile.returned",
  "profile.withdrawn",
  "question.answered",
  "question.asked",
  "supervision.reminder",
  "supervision.slot_cancelled",
];

describe("dane karty „Powiadomienia e-mail”", () => {
  it("każdy e-mail, który osoba może wyłączyć, ma polską nazwę", () => {
    for (const rodzaj of WYLACZALNE) {
      expect(ETYKIETY_EMAILI[rodzaj], rodzaj).toBeTruthy();
      expect(etykietaEmaila(rodzaj)).not.toContain(".");
    }
    expect(Object.keys(ETYKIETY_EMAILI).sort()).toEqual([...WYLACZALNE].sort());
  });

  it("nieznany rodzaj dostaje nazwę ogólną", () => {
    expect(etykietaEmaila("future.unmapped_type")).toBe("Inne powiadomienie");
  });

  it("do zapisu idą wyłącznie zmienione e-maile, które wolno wyłączyć", () => {
    const bazowe: PreferencjaEmail[] = [
      { type: "internship.accepted", email: true, switchable: true },
      { type: "course.unlocked", email: false, switchable: true },
      { type: "access.expired", email: true, switchable: false },
    ];
    const robocze: PreferencjaEmail[] = [
      { type: "internship.accepted", email: false, switchable: true },
      { type: "course.unlocked", email: false, switchable: true },
      { type: "access.expired", email: false, switchable: false },
    ];

    expect(zmienionePreferencje(bazowe, robocze)).toEqual([{ type: "internship.accepted", email: false }]);
    expect(zmienionePreferencje(bazowe, bazowe)).toEqual([]);
  });
});
