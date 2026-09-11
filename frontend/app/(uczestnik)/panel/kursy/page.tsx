"use client";

import CourseCard from "@/components/courses/CourseCard";
import ListTemplate from "@/components/templates/ListTemplate";
import { useZasob } from "@/lib/hooks/useZasob";
import { fetchCourses, type CourseListItem } from "@/lib/courses";

/**
 * Katalog kursów uczestnika (H05), na szablonie `ListTemplate` (C2 wariant C).
 *
 * Komponent kliencki, bo token Bearer żyje w pamięci klienta (lib/api.ts), nie na serwerze.
 * Bez kontrolki grupy produktowej — serwer zawęża katalog niejawnie do grupy
 * użytkownika, więc filtr na tym ekranie byłby martwym kodem.
 */
export default function CoursesCataloguePage() {
  const { stan, ponow } = useZasob<CourseListItem[]>(fetchCourses);

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
      komunikatBledu={stan.status === "error" ? stan.message : undefined}
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
