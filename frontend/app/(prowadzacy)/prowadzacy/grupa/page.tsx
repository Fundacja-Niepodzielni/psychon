import type { Metadata } from "next";
import InstructorGroup from "@/components/h12/InstructorGroup";

export const metadata: Metadata = {
  title: "Moja grupa — Niepodzielni",
};

export default function InstructorGroupPage() {
  return <InstructorGroup />;
}
