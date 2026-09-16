import type { Metadata } from "next";
import InstructorStart from "@/components/instructor/InstructorStart";

export const metadata: Metadata = {
  title: "Panel prowadzącego — Niepodzielni",
};

export default function InstructorHomePage() {
  return <InstructorStart />;
}
