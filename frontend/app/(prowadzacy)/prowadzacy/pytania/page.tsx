import type { Metadata } from "next";
import InstructorQuestionInbox from "@/components/questions/InstructorQuestionInbox";

export const metadata: Metadata = {
  title: "Pytania — Panel prowadzącego — Niepodzielni",
};

export default function InstructorQuestionsPage() {
  return <InstructorQuestionInbox />;
}
