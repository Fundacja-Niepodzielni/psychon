import type { Metadata } from "next";
import InstructorGroupThread from "@/components/chat/InstructorGroupThread";

export const metadata: Metadata = {
  title: "Wątek grupowy — Panel prowadzącego — Niepodzielni",
};

export default function InstructorGroupThreadPage() {
  return <InstructorGroupThread />;
}
