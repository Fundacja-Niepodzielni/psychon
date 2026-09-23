import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import TestWiedzyKursu from "@/components/testy/TestWiedzyKursu";
import type { AdminCourse } from "@/lib/h08/types";

/**
 * Wejście do banku pytań z karty kursu w panelu prowadzącego — odpowiednik
 * `CourseQuestionBankLink` (H10, panel administracji).
 * Mierzone jest wyłącznie zachowanie zależne od `course.test_id`: dziś
 * `AdminCourseResource` go nie wystawia, więc na produkcji karta nie
 * renderuje się wcale (brak zgadywania linku).
 */

const kurs: AdminCourse = {
  id: 4,
  title: "Praca z emocjami",
  slug: "praca-z-emocjami",
  description: null,
  type: "course",
  product_group: "psychon",
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

describe("TestWiedzyKursu", () => {
  it("bez test_id w zasobie kursu nie renderuje nic", () => {
    const { container } = render(<TestWiedzyKursu course={kurs} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("z test_id renderuje kartę z linkiem do /prowadzacy/testy/{id}/pytania", () => {
    render(<TestWiedzyKursu course={{ ...kurs, test_id: 12 }} />);

    expect(
      screen.getByRole("heading", { name: "Test wiedzy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Otwórz bank pytań" }),
    ).toHaveAttribute("href", "/prowadzacy/testy/12/pytania");
  });
});
