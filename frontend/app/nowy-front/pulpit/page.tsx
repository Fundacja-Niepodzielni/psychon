import { Pulpit } from "@/nowy-front/pulpit/Pulpit";

/**
 * Trasa `/nowy-front/pulpit` — pulpit uczestnika (U-01) albo pulpit kursów
 * studenta (U-02) na `DashboardTemplate`; wybór po roli z `GET /me` robi
 * `Pulpit`. Odczyty biegną z przeglądarki — powód opisany w `dane.ts`.
 */
export default function StronaPulpit() {
  return <Pulpit />;
}
