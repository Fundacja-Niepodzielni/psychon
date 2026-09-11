"use client";

import CourseCard from "@/components/courses/CourseCard";
import ListTemplate from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import { fetchCourses, type CourseListItem } from "@/lib/courses";

/** Katalog nie ma stron — hak stronicowany dostaje `pobierz`, który ignoruje
 * `strona` i zwraca `{ data }` bez `meta` (patrz komentarz w haku). */
function pobierzKursy(): Promise<{ data: CourseListItem[] }> {
  return fetchCourses().then((data) => ({ data }));
}

/**
 * Katalog kursów uczestnika (H05), na szablonie `ListTemplate` (C2 wariant C).
 *
 * Komponent kliencki, bo token Bearer żyje w pamięci klienta (lib/api.ts), nie na serwerze.
 * Bez kontrolki grupy produktowej — serwer zawęża katalog niejawnie do grupy
 * użytkownika, więc filtr na tym ekranie byłby martwym kodem.
 */
export default function CoursesCataloguePage() {
  const { stan, ponow } = useZasobStronicowany<CourseListItem>(pobierzKursy);

  const dane = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && dane.length === 0;

  return (
    <ListTemplate
      naglowek={{
        title: "Kursy",
        description:
          "Twoja ścieżka szkoleniowa. Kolejny etap otwiera się po ukończeniu poprzedniego.",
      }}
      stan={listaPusta ? "empty" : stan.status}
      httpStatus={stan.status === "error" ? stan.httpStatus : undefined}
      komunikatLadowania="Ładowanie kursów…"
      komunikatBledu={stan.status === "error" ? stan.message : undefined}
      komunikatBleduTytul={
        stan.status === "error" ? "Nie udało się wczytać kursów" : undefined
      }
      onPonow={ponow}
      pustyTytul="Nie masz jeszcze kursów"
      pustyOpis="Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się on w tym miejscu."
    >
      <ul className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dane.map((course) => (
          <li key={course.id} className="flex">
            <CourseCard course={course} />
          </li>
        ))}
      </ul>
    </ListTemplate>
  );
}
