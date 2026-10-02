import { DziennikStazu } from "@/nowy-front/dziennik-stazu/DziennikStazu";

/**
 * Trasa `/nowy-front/staz` — dziennik stażu osoby wolontariackiej (H11,
 * `InternshipEntryController`) w nowym wyglądzie. Odczyt i zapis biegną
 * z przeglądarki (`DziennikStazu.tsx`) — powód opisany w
 * `nowy-front/pulpit/dane.ts`.
 */
export default function StronaDziennikaStazu() {
  return <DziennikStazu />;
}
