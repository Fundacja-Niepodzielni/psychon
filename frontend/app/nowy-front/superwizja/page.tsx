import { SuperwizjaUczestnika } from "@/nowy-front/superwizja-uczestnika/SuperwizjaUczestnika";

/**
 * Trasa `/nowy-front/superwizja` — zapisy osoby wolontariackiej na terminy
 * superwizji (H12, `ParticipantSupervisionController`) w nowym wyglądzie.
 * Odczyt i zapis biegną z przeglądarki (`SuperwizjaUczestnika.tsx`) — powód
 * opisany w `nowy-front/pulpit/dane.ts`.
 */
export default function StronaSuperwizji() {
  return <SuperwizjaUczestnika />;
}
