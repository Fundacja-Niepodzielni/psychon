import type { Metadata } from "next";
import ListaKursowProwadzacego from "@/components/kursy/ListaKursowProwadzacego";

export const metadata: Metadata = {
  title: "Kursy — Panel prowadzącego — Niepodzielni",
};

export default function InstructorCoursesPage() {
  return <ListaKursowProwadzacego />;
}
